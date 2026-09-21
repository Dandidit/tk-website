import { neon } from "@neondatabase/serverless";
import { requireAuth } from "./_auth.js";

const sql = neon(process.env.terakira_db_DATABASE_URL);

const ITEM_IDS = [
  "c_name", "c_ssm", "c_tin", "c_addr", "c_fye", "c_hold",
  "d_ssm", "d_tax", "d_fs", "d_bank", "d_pay", "d_loan", "d_asset", "d_sst",
  "a_soft", "a_inv", "a_bank", "a_pay", "a_prior",
  "s_letter", "s_dep", "s_comms"
];

function json(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function clean(value, max = 5000) {
  return typeof value === "string" ? value.trim().slice(0, max) : null;
}

function normalizeState(body) {
  const co = body?.co || {};
  const ans = body?.ans || {};
  const items = body?.items || {};
  const holders = Array.isArray(co.holders) ? co.holders : [];

  return {
    current_step: Math.max(0, Math.min(6, Number(body?.step) || 0)),
    new_business: typeof ans.newCo === "boolean" ? ans.newCo : null,
    bank_age: clean(ans.bank, 30),
    payroll: typeof ans.payroll === "boolean" ? ans.payroll : null,
    loans: typeof ans.loans === "boolean" ? ans.loans : null,
    sst: typeof ans.sst === "boolean" ? ans.sst : null,
    company_name: clean(co.name, 200),
    entity_type: clean(co.entity, 50),
    ssm_number: clean(co.ssm, 50),
    tin: clean(co.tin, 100),
    registered_address: clean(co.addr, 2000),
    contact_name: clean(co.contact, 200),
    phone: clean(co.phone, 50),
    email: clean(co.email, 254),
    financial_year_end: clean(co.fye, 30),
    communication_preference: clean(body?.comms, 50),
    signature_name: clean(body?.sig, 200),
    items,
    holders: holders.slice(0, 50).map(h => ({
      name: clean(h?.name, 200),
      ownership_pct: Number(h?.pct) || 0
    }))
  };
}

function isComplete(s) {
  const requiredAnswers = [s.new_business, s.bank_age, s.payroll, s.loans, s.sst].every(v => v !== null);
  const company = !!(
    s.company_name && s.entity_type && s.ssm_number && s.tin &&
    s.registered_address && s.contact_name && (s.phone || s.email) && s.financial_year_end
  );
  const owners = s.holders.length > 0 &&
    s.holders.every(h => h.name) &&
    Math.round(s.holders.reduce((a, h) => a + h.ownership_pct, 0) * 100) === 10000;

  const itemStatus = id => s.items?.[id]?.status;
  const done = id => ["done", "na", "team", "review"].includes(itemStatus(id));
  const fileDone = id => done(id) || !!s.items?.[id]?.fileUrl;

  const docs = ["d_ssm", "d_asset"].every(fileDone) &&
    (s.new_business === true || fileDone("d_tax")) &&
    (s.new_business === true || fileDone("d_fs")) &&
    (s.bank_age === "none" || fileDone("d_bank")) &&
    (s.payroll === false || fileDone("d_pay")) &&
    (s.loans === false || fileDone("d_loan")) &&
    (s.sst === false || fileDone("d_sst"));

  const access =
    true && // a_soft and a_inv are handled by Terakira
    (s.payroll === false || done("a_pay")) &&
    done("a_bank") &&
    (s.new_business === true || done("a_prior"));

  const start = !!s.signature_name && done("s_letter") &&
    done("s_dep") && !!s.communication_preference;

  return requiredAnswers && company && owners && docs && access && start;
}

async function getData(user) {
  const [rows, owners, items] = await Promise.all([
    sql`SELECT * FROM public.onboarding WHERE user_id = ${user.id} LIMIT 1`,
    sql`SELECT name, ownership_pct FROM public.onboarding_owners WHERE user_id = ${user.id} ORDER BY created_at, id`,
    sql`SELECT item_id, status, note, file_url, file_name, updated_at FROM public.onboarding_items WHERE user_id = ${user.id}`
  ]);

  const row = rows[0] || null;
  const itemMap = Object.fromEntries(items.map(i => [i.item_id, {
    status: i.status, note: i.note || "", fileUrl: i.file_url || "", fileName: i.file_name || ""
  }]));

  return {
    exists: !!row,
    completed: !!row?.completed_at,
    skipped: !!row?.skipped,
    onboarding: row ? {
      step: row.current_step,
      ans: { newCo: row.new_business, bank: row.bank_age, payroll: row.payroll, loans: row.loans, sst: row.sst },
      co: {
        name: row.company_name || "", entity: row.entity_type || "", ssm: row.ssm_number || "",
        tin: row.tin || "", addr: row.registered_address || "", contact: row.contact_name || "",
        phone: row.phone || "", email: row.email || "", fye: row.financial_year_end || "",
        holders: owners.length ? owners.map(o => ({ name: o.name, pct: String(o.ownership_pct) })) : [{ name: "", pct: "" }]
      },
      items: itemMap,
      comms: row.communication_preference || "",
      sig: row.signature_name || ""
    } : null
  };
}

async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method === "GET") {
    try {
      return res.status(200).json(await getData(user));
    } catch (error) {
      console.error("Onboarding fetch failed:", error);
      return res.status(500).json({ error: "Unable to load onboarding data." });
    }
  }

  try {
    const body = req.body || {};
    const s = normalizeState(body);
    const action = body?.action || "save";
    const complete = action === "complete" && isComplete(s);

    if (action === "complete" && !complete) {
      return res.status(400).json({ error: "Onboarding is not complete." });
    }

    await sql`
      INSERT INTO public.onboarding (
        user_id, current_step, skipped, completed_at,
        new_business, bank_age, payroll, loans, sst,
        company_name, entity_type, ssm_number, tin, registered_address,
        contact_name, phone, email, financial_year_end,
        communication_preference, signature_name, signed_at, deposit_status, updated_at
      ) VALUES (
        ${user.id}, ${s.current_step}, ${action === "skip"},
        ${complete ? new Date() : null},
        ${s.new_business}, ${s.bank_age}, ${s.payroll}, ${s.loans}, ${s.sst},
        ${s.company_name}, ${s.entity_type}, ${s.ssm_number}, ${s.tin}, ${s.registered_address},
        ${s.contact_name}, ${s.phone}, ${s.email}, ${s.financial_year_end},
        ${s.communication_preference}, ${s.signature_name},
        ${body?.items?.s_letter?.status === "done" ? new Date() : null},
        ${body?.items?.s_dep?.status === "review" ? "review" : null}, NOW()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        current_step = EXCLUDED.current_step,
        skipped = EXCLUDED.skipped,
        completed_at = CASE WHEN ${complete} THEN NOW() ELSE public.onboarding.completed_at END,
        new_business = EXCLUDED.new_business,
        bank_age = EXCLUDED.bank_age,
        payroll = EXCLUDED.payroll,
        loans = EXCLUDED.loans,
        sst = EXCLUDED.sst,
        company_name = EXCLUDED.company_name,
        entity_type = EXCLUDED.entity_type,
        ssm_number = EXCLUDED.ssm_number,
        tin = EXCLUDED.tin,
        registered_address = EXCLUDED.registered_address,
        contact_name = EXCLUDED.contact_name,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        financial_year_end = EXCLUDED.financial_year_end,
        communication_preference = EXCLUDED.communication_preference,
        signature_name = EXCLUDED.signature_name,
        signed_at = CASE WHEN ${body?.items?.s_letter?.status === "done"} THEN NOW() ELSE public.onboarding.signed_at END,
        deposit_status = EXCLUDED.deposit_status,
        updated_at = NOW()
    `;

    await sql`DELETE FROM public.onboarding_owners WHERE user_id = ${user.id}`;
    for (const h of s.holders) {
      if (h.name) {
        await sql`
          INSERT INTO public.onboarding_owners (user_id, name, ownership_pct)
          VALUES (${user.id}, ${h.name}, ${h.ownership_pct})
        `;
      }
    }

    for (const id of ITEM_IDS) {
      const item = s.items?.[id];
      if (!item?.status) continue;
      await sql`
        INSERT INTO public.onboarding_items (user_id, item_id, status, note, file_url, file_name, updated_at)
        VALUES (${user.id}, ${id}, ${item.status}, ${clean(item.note, 1000)}, ${clean(item.fileUrl, 2000)}, ${clean(item.fileName, 500)}, NOW())
        ON CONFLICT (user_id, item_id) DO UPDATE SET
          status = EXCLUDED.status,
          note = EXCLUDED.note,
          file_url = EXCLUDED.file_url,
          file_name = EXCLUDED.file_name,
          updated_at = NOW()
      `;
    }

    return res.status(200).json({ success: true, completed: complete });
  } catch (error) {
    console.error("Onboarding save failed:", error);
    return res.status(500).json({ error: "Unable to save onboarding data." });
  }
}

export default handler;
