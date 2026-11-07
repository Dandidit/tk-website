import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { requireAuth, requireAdmin } from "../lib/auth.js";

const sql = neon(process.env.terakira_db_DATABASE_URL);
const XERO_AUTHORIZE = "https://login.xero.com/identity/connect/authorize";
const XERO_TOKEN = "https://identity.xero.com/connect/token";
const XERO_API = "https://api.xero.com/api.xro/2.0";
const SCOPES = [
  "openid", "profile", "email", "offline_access",
  "accounting.settings.read", "accounting.invoices.read",
  "accounting.reports.profitandloss.read", "accounting.reports.banksummary.read"
].join(" ");

function json(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

function encryptionKey() {
  const key = Buffer.from(process.env.XERO_TOKEN_ENCRYPTION_KEY || "", "base64");
  if (key.length !== 32) throw new Error("XERO_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

function encrypt(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(v => v.toString("base64url")).join(".");
}

function decrypt(value) {
  const [ivText, tagText, dataText] = String(value || "").split(".");
  if (!ivText || !tagText || !dataText) throw new Error("Stored Xero token is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataText, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function basicAuth() {
  return "Basic " + Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString("base64");
}

function configReady() {
  return !!(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET && process.env.XERO_REDIRECT_URI && process.env.XERO_TOKEN_ENCRYPTION_KEY);
}

async function tokenRequest(params) {
  const response = await fetch(XERO_TOKEN, {
    method: "POST",
    headers: {
      Authorization: basicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body: new URLSearchParams(params)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || "Xero token request failed.");
  return data;
}

async function getConnection() {
  const rows = await sql`SELECT * FROM public.xero_connections WHERE connection_key = 'primary' LIMIT 1`;
  if (!rows[0]) throw new Error("TeraKira has not connected its Xero account.");
  return rows[0];
}

async function saveTokens(tokens) {
  const expiresAt = new Date(Date.now() + Number(tokens.expires_in || 1800) * 1000);
  await sql`
    INSERT INTO public.xero_connections
      (connection_key, access_token_encrypted, refresh_token_encrypted, expires_at, scope, updated_at)
    VALUES
      ('primary', ${encrypt(tokens.access_token)}, ${encrypt(tokens.refresh_token)}, ${expiresAt}, ${tokens.scope || SCOPES}, NOW())
    ON CONFLICT (connection_key) DO UPDATE SET
      access_token_encrypted = EXCLUDED.access_token_encrypted,
      refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
      expires_at = EXCLUDED.expires_at,
      scope = EXCLUDED.scope,
      updated_at = NOW()
  `;
}

async function getAccessToken() {
  let connection = await getConnection();
  if (new Date(connection.expires_at).getTime() > Date.now() + 120000) {
    return decrypt(connection.access_token_encrypted);
  }

  const refreshed = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: decrypt(connection.refresh_token_encrypted)
  });
  await saveTokens(refreshed);
  return refreshed.access_token;
}

async function xeroFetch(path) {
  const accessToken = await getAccessToken();
  const response = await fetch(`https://api.xero.com${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
  });
  const data = await response.json();
  if (!response.ok) {
    const message = data?.Message || data?.Detail || `Xero API returned ${response.status}.`;
    throw new Error(message);
  }
  return data;
}

async function getTenants() {
  return xeroFetch("/connections");
}

async function adminConnect(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  console.log("Xero env check:", {
    clientId: !!process.env.XERO_CLIENT_ID,
    clientSecret: !!process.env.XERO_CLIENT_SECRET,
    redirectUri: !!process.env.XERO_REDIRECT_URI,
    encryptionKey: !!process.env.XERO_TOKEN_ENCRYPTION_KEY
  });
  if (!configReady()) return json(res, 500, { error: "Xero environment variables are not configured." });

  const state = randomBytes(32).toString("hex");
  await sql`
    INSERT INTO public.xero_oauth_states (state, created_by, expires_at)
    VALUES (${state}, ${admin.id}, NOW() + INTERVAL '10 minutes')
  `;

  const url = new URL(XERO_AUTHORIZE);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.XERO_CLIENT_ID);
  url.searchParams.set("redirect_uri", process.env.XERO_REDIRECT_URI);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  return json(res, 200, { authorizationUrl: url.toString() });
}

async function oauthCallback(req, res) {
  if (!configReady()) return json(res, 500, { error: "Xero environment variables are not configured." });
  const { code, state, error } = req.query || {};
  if (error) return res.redirect("/admin.html?xero=denied");
  if (!code || !state) return json(res, 400, { error: "Missing Xero authorization code or state." });

  const states = await sql`
    DELETE FROM public.xero_oauth_states
    WHERE state = ${String(state)} AND expires_at > NOW()
    RETURNING created_by
  `;
  if (!states[0]) return json(res, 400, { error: "Invalid or expired Xero authorization state." });
  const [initiator] = await sql`
    SELECT role FROM neon_auth."user" WHERE id = ${states[0].created_by} LIMIT 1
  `;
  if (initiator?.role !== "admin") return json(res, 403, { error: "The administrator who started this Xero connection is no longer authorised." });

  try {
    const tokens = await tokenRequest({
      grant_type: "authorization_code",
      code: String(code),
      redirect_uri: process.env.XERO_REDIRECT_URI
    });
    if (!tokens.refresh_token) throw new Error("Xero did not return a refresh token. Ensure offline_access is included.");
    await saveTokens(tokens);
    return res.redirect("/admin.html?xero=connected");
  } catch (err) {
    console.error("Xero OAuth callback failed:", err);
    return res.redirect("/admin.html?xero=error");
  }
}

async function connectionStatus(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const rows = await sql`
      SELECT updated_at, expires_at, scope
      FROM public.xero_connections
      WHERE connection_key = 'primary'
      LIMIT 1
    `;
    const connection = rows[0];
    return json(res, 200, {
      connected: Boolean(connection),
      updatedAt: connection?.updated_at || null,
      expiresAt: connection?.expires_at || null,
      scope: connection?.scope || null
    });
  } catch (error) {
    console.error("Xero connection status failed:", error);
    return json(res, 500, { error: "Unable to retrieve Xero connection status." });
  }
}

async function listTenants(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    const tenants = await getTenants();
    return json(res, 200, tenants.map(t => ({ tenantId: t.tenantId, tenantName: t.tenantName, tenantType: t.tenantType })));
  } catch (error) {
    console.error("Xero tenant listing failed:", error);
    return json(res, 400, { error: error.message });
  }
}

async function listUsers(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const users = await sql`
      SELECT
        u.id,
        u.name,
        u.email,
        m.tenant_id,
        m.tenant_name,
        m.updated_at
      FROM neon_auth."user" u
      LEFT JOIN public.xero_client_mappings m
        ON m.client_id = u.id
      WHERE COALESCE(u.role, '') <> 'admin'
      ORDER BY u.name ASC
    `;

    return json(res, 200, users);
  } catch (error) {
    console.error("Xero user listing failed:", error);
    return json(res, 500, { error: "Unable to retrieve registered users." });
  }
}

async function mapTenant(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const { clientId, tenantId, tenantName } = req.body || {};
  if (!clientId || !tenantId) return json(res, 400, { error: "clientId and tenantId are required." });

  try {
    const [client] = await sql`
      SELECT id, role
      FROM neon_auth."user"
      WHERE id = ${clientId}
      LIMIT 1
    `;

    if (!client || client.role === "admin") {
      return json(res, 404, { error: "TeraKira client not found." });
    }
    const tenants = await getTenants();
    const tenant = tenants.find(t => t.tenantId === tenantId);
    if (!tenant) return json(res, 403, { error: "This Xero organisation is not connected to TeraKira's Xero account." });

    const [mapping] = await sql`
      INSERT INTO public.xero_client_mappings (client_id, tenant_id, tenant_name, mapped_by, updated_at)
      VALUES (${clientId}, ${tenantId}, ${tenant.tenantName || tenantName || null}, ${admin.id}, NOW())
      ON CONFLICT (client_id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        tenant_name = EXCLUDED.tenant_name,
        mapped_by = EXCLUDED.mapped_by,
        updated_at = NOW()
      RETURNING client_id, tenant_id, tenant_name, updated_at
    `;
    return json(res, 200, mapping);
  } catch (error) {
    console.error("Xero client mapping failed:", error);
    if (error.code === "23505") {
      return json(res, 409, {
        error: "This Xero organisation is already assigned to another client."
      });
    }

    return json(res, 400, { error: error.message });
  }
}

async function removeMapping(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { clientId } = req.body || {};

  if (!clientId) {
    return json(res, 400, { error: "clientId is required." });
  }

  try {
    const [mapping] = await sql`
      DELETE FROM public.xero_client_mappings
      WHERE client_id = ${clientId}
      RETURNING client_id, tenant_id, tenant_name
    `;

    if (!mapping) {
      return json(res, 404, { error: "No Xero mapping found for this client." });
    }

    return json(res, 200, {
      success: true,
      message: "Xero organisation mapping removed."
    });
  } catch (error) {
    console.error("Xero mapping removal failed:", error);
    return json(res, 500, { error: "Unable to remove Xero mapping." });
  }
}

function extractReport(report) {
  const rows = [];
  function walk(items = []) {
    for (const row of items) {
      if (row.RowType === "Row" && Array.isArray(row.Cells)) {
        rows.push(row.Cells.map(c => c.Value ?? null));
      }
      if (row.Rows) walk(row.Rows);
    }
  }
  for (const section of report?.Reports?.[0]?.Rows || []) walk([section]);
  return rows;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Xero enforces a hard concurrency limit of 5 in-flight requests per
// tenant connection. Exceeding it returns HTTP 429 with an EMPTY body (no
// JSON at all), so a naive `await response.json()` blows up with
// "Unexpected end of JSON input" instead of a useful error. Run Xero calls
// through this small pool (max 4, safely under Xero's limit of 5) instead of
// Promise.all-ing everything at once.
async function runLimited(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

// The user wants genuine calendar months (1st -> end of month), not Xero's
// rolling periods/timeframe columns (which step back by exactly one month
// from an arbitrary toDate, e.g. "7th to 7th" or "30th to 30th" — never truly
// the 1st-to-end-of-month the user is picturing). Fetch each of the last 6
// calendar months as its own single-period report and read its Net Profit.
async function fetchCalendarMonthNetProfit(tenantGet, monthsBack, limit) {
  const now = new Date();
  const months = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const first = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const lastCalendarDay = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    // Don't ask Xero for days beyond today in the current (partial) month.
    const last = i === 0 && lastCalendarDay > now ? now : lastCalendarDay;
    months.push({ label: `${MONTH_NAMES[first.getMonth()]} ${first.getFullYear()}`, fromDate: ymd(first), toDate: ymd(last) });
  }
  const reports = await runLimited(
    months.map(m => () => tenantGet(`/Reports/ProfitAndLoss?${new URLSearchParams({ fromDate: m.fromDate, toDate: m.toDate })}`)),
    limit
  );
  return months.map((m, i) => {
    const rows = extractReport(reports[i]);
    const netProfitRow = rows.find(r => /net profit|net income/i.test(String(r[0] || "")));
    const value = netProfitRow ? Number(String(netProfitRow[1] ?? "0").replace(/,/g, "")) : null;
    return { label: m.label, fromDate: m.fromDate, toDate: m.toDate, netProfit: Number.isFinite(value) ? value : null };
  });
}

async function clientDashboard(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;
  try {
    const [mapping] = await sql`
      SELECT tenant_id, tenant_name FROM public.xero_client_mappings
      WHERE client_id = ${user.id} LIMIT 1
    `;
    if (!mapping) return json(res, 404, { error: "No Xero organisation has been assigned to this client." });

    const tenantId = mapping.tenant_id;
    // Xero requires the selected tenant header. Re-fetch these resources with that header.
    const accessToken = await getAccessToken();
    async function tenantGet(path, attempt = 1) {
      const response = await fetch(`${XERO_API}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}`, "xero-tenant-id": tenantId, Accept: "application/json" }
      });
      // Read as text first: a 429 (rate limit exceeded) comes back with an
      // EMPTY body, and calling response.json() directly on that throws the
      // opaque "Unexpected end of JSON input" instead of a useful error.
      const text = await response.text();
      if (response.status === 429 && attempt <= 2) {
        const retryAfter = Math.min(Number(response.headers.get("retry-after")) || 2, 10);
        await new Promise(r => setTimeout(r, retryAfter * 1000));
        return tenantGet(path, attempt + 1);
      }
      let data = null;
      if (text) {
        try { data = JSON.parse(text); } catch { /* fall through to status-based error below */ }
      }
      if (!response.ok) {
        const problem = response.headers.get("x-rate-limit-problem");
        throw new Error(
          data?.Message || data?.Detail ||
          (problem ? `Xero rate limit exceeded (${problem}). Please try again shortly.` : `Xero API returned ${response.status}.`)
        );
      }
      return data || {};
    }
    // Run the 6 calendar-month P&L calls through a concurrency-limited pool
    // (Xero allows only 5 in-flight requests per org), then fetch the bank
    // summary and invoices afterwards so total in-flight calls never exceed
    // Xero's limit.
    const calendarMonths = await fetchCalendarMonthNetProfit(tenantGet, 6, 4);
    const [bankData, invoiceData] = await Promise.all([
      tenantGet(`/Reports/BankSummary?${new URLSearchParams({ fromDate: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10), toDate: new Date().toISOString().slice(0, 10) })}`),
      tenantGet(`/Invoices?${new URLSearchParams({ where: 'Type=="ACCREC"&&Status=="AUTHORISED"' })}`)
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const outstanding = (invoiceData.Invoices || []).filter(i => Number(i.AmountDue || 0) > 0);
    return json(res, 200, {
      organisation: mapping.tenant_name,
      // profitAndLossMonths is real calendar months (1st -> end of month),
      // already in chronological (oldest -> newest) order — this is what the
      // P&L chart should render directly.
      profitAndLossMonths: calendarMonths,
      bankSummary: bankData.Reports?.[0] || null,
      bankSummaryRows: extractReport(bankData),
      outstandingInvoices: {
        count: outstanding.length,
        total: outstanding.reduce((sum, i) => sum + Number(i.AmountDue || 0), 0),
        overdueCount: outstanding.filter(i => i.DueDateString && i.DueDateString < today).length
      },
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Xero dashboard fetch failed:", error);
    return json(res, 502, { error: error.message || "Unable to retrieve Xero data." });
  }
}

async function disconnect(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  await sql`DELETE FROM public.xero_connections WHERE connection_key = 'primary'`;
  return json(res, 200, { success: true, message: "TeraKira's Xero connection has been removed." });
}

export default async function handler(req, res) {
  const action = String(req.query?.action || "");
  try {
    if (action === "connect" && req.method === "POST") return adminConnect(req, res);
    if (action === "callback" && req.method === "GET") return oauthCallback(req, res);
    if (action === "status" && req.method === "GET") return connectionStatus(req, res);
    if (action === "tenants" && req.method === "GET") return listTenants(req, res);
    if (action === "users" && req.method === "GET") return listUsers(req, res);
    if (action === "mapping" && req.method === "POST") return mapTenant(req, res);
    if (action === "mapping" && req.method === "DELETE") return removeMapping(req, res);
    if (action === "dashboard" && req.method === "GET") return clientDashboard(req, res);
    if (action === "disconnect" && req.method === "POST") return disconnect(req, res);
    return json(res, 404, { error: "Unknown Xero action or unsupported method." });
  } catch (error) {
    console.error("Xero API error:", error);
    return json(res, 500, { error: "Xero operation failed." });
  }
}
