
import { neon } from "@neondatabase/serverless";
import { get } from "@vercel/blob";
import { requireAuth } from "./_auth.js";

const sql = neon(process.env.terakira_db_DATABASE_URL);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const itemId = String(req.query?.itemId || "");

  if (!["d_ssm", "d_tax", "d_fs", "d_bank", "d_pay",
        "d_loan", "d_asset", "d_sst"].includes(itemId)) {
    return res.status(400).json({ error: "Invalid document." });
  }

  try {
    const rows = await sql`
      SELECT file_url, file_name
      FROM public.onboarding_items
      WHERE user_id = ${user.id}
        AND item_id = ${itemId}
      LIMIT 1
    `;

    if (!rows[0]?.file_url) {
      return res.status(404).json({ error: "File not found." });
    }

    const result = await get(rows[0].file_url, {
      access: "private"
    });

    if (!result || result.statusCode !== 200) {
      return res.status(404).json({ error: "File not found." });
    }

    res.status(200);
    res.setHeader(
      "Content-Type",
      result.blob.contentType || "application/octet-stream"
    );
    res.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(
        rows[0].file_name || "document"
      )}`
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    const reader = result.stream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }

    res.end();
  } catch (error) {
    console.error("File retrieval failed:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        error: "Unable to open uploaded file."
      });
    }

    res.end();
  }
}