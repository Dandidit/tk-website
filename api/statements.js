import { neon } from "@neondatabase/serverless";
import { requireAuth, requireAdmin } from "./_auth.js";

const sql = neon(process.env.terakira_db_DATABASE_URL);

export default async function handler(req, res) {
  if (req.method === "GET") {
    const user = await requireAuth(req, res);
    if (!user) return;

    if (user.role === "admin") {
      const rows = await sql`
        SELECT
          s.*,
          u.email AS user_email,
          u.name AS user_name
        FROM bank_statements s
        JOIN neon_auth."user" u ON u.id = s.user_id
        ORDER BY s.created_at DESC
      `;
      return res.status(200).json(rows);
    }

    const rows = await sql`
      SELECT *
      FROM bank_statements
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
    `;
    return res.status(200).json(rows);
  }

  if (req.method === "POST") {
    const user = await requireAuth(req, res);
    if (!user) return;

    const {
      originalFilename,
      storageUrl,
      storagePath,
      fileSize
    } = req.body || {};

    if (!originalFilename || !storageUrl) {
      return res.status(400).json({ error: "Missing file information" });
    }

    const [statement] = await sql`
      INSERT INTO bank_statements (
        user_id,
        bank_code,
        original_filename,
        storage_url,
        storage_path,
        file_size
      )
      VALUES (
        ${user.id},
        'MAYBANK',
        ${originalFilename},
        ${storageUrl},
        ${storagePath || null},
        ${fileSize || null}
      )
      RETURNING *
    `;

    return res.status(201).json(statement);
  }

  if (req.method === "PATCH") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { id, action } = req.body || {};

    if (!id || action !== "publish") {
      return res.status(400).json({ error: "Invalid action" });
    }

    const [statement] = await sql`
      UPDATE bank_statements
      SET
        reconciliation_published = TRUE,
        published_at = NOW(),
        published_by = ${admin.id}
      WHERE id = ${id}
      RETURNING *
    `;

    if (!statement) {
      return res.status(404).json({ error: "Statement not found" });
    }

    return res.status(200).json(statement);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
