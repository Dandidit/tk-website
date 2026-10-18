import { neon } from "@neondatabase/serverless";
import { get } from "@vercel/blob";
import { requireAuth } from "./_auth.js";

const sql = neon(process.env.terakira_db_DATABASE_URL);
const ALLOWED_ITEMS = ["d_ssm", "d_tax", "d_fs", "d_bank", "d_pay", "d_loan", "d_asset", "d_sst"];

async function sendPrivateBlob(res, path, filename = "document") {
  const blob = await get(path, { access: "private" });
  if (!blob || blob.statusCode !== 200) {
    return res.status(404).json({ error: "File not found." });
  }

  res.status(200);
  res.setHeader("Content-Type", blob.blob.contentType || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  const reader = blob.stream.getReader();
  res.on("close", () => reader.cancel().catch(() => {}));
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }
  res.end();
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const itemId = String(req.query?.itemId || "");
  const requestedUserId = String(req.query?.userId || "");
  const statementId = String(req.query?.id || "");

  // Onboarding document: /api/onboarding-file?itemId=d_ssm[&userId=...]
  if (itemId) {
    if (!ALLOWED_ITEMS.includes(itemId)) {
      return res.status(400).json({ error: "Invalid document." });
    }

    const targetUserId = requestedUserId || user.id;
    if (user.role !== "admin" && targetUserId !== user.id) {
      return res.status(403).json({ error: "You can only access your own files." });
    }

    try {
      const rows = await sql`
        SELECT file_url, file_name
        FROM public.onboarding_items
        WHERE user_id = ${targetUserId} AND item_id = ${itemId}
        LIMIT 1
      `;
      if (!rows[0]?.file_url) return res.status(404).json({ error: "File not found." });
      return await sendPrivateBlob(res, rows[0].file_url, rows[0].file_name || "document");
    } catch (error) {
      console.error("Onboarding file retrieval failed:", error);
      if (!res.headersSent) return res.status(500).json({ error: "Unable to open uploaded file." });
      return res.end();
    }
  }

  // Bank statement: /api/onboarding-file?id=...
  if (statementId && !requestedUserId) {
    try {
      const rows = user.role === "admin"
        ? await sql`SELECT storage_path FROM bank_statements WHERE id = ${statementId} LIMIT 1`
        : await sql`SELECT storage_path FROM bank_statements WHERE id = ${statementId} AND user_id = ${user.id} LIMIT 1`;
      if (!rows[0]?.storage_path) return res.status(404).json({ error: "Statement not found" });
      return await sendPrivateBlob(res, rows[0].storage_path, "statement.pdf");
    } catch (error) {
      console.error("Statement file retrieval failed:", error);
      if (!res.headersSent) return res.status(500).json({ error: "Unable to open statement." });
      return res.end();
    }
  }

  return res.status(400).json({ error: "Invalid file request." });
}
