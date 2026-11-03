import { neon } from "@neondatabase/serverless";
import { requireAuth, requireAdmin } from "../auth.js";
import { statementPrefix, isOwnedBlob } from "../blob-paths.js";

const sql = neon(process.env.terakira_db_DATABASE_URL);

export default async function handler(req, res) {
  if (req.method === "GET") {
    const user = await requireAuth(req, res);
    if (!user) return;

    if (user.role === "admin") {
      const rows = await sql`
        SELECT
          s.*,
          ev.title AS event_title,
          ev.period::text AS event_period,
          u.email AS user_email,
          u.name AS user_name
        FROM bank_statements s
        JOIN neon_auth."user" u ON u.id = s.user_id
        LEFT JOIN events ev ON ev.id = s.event_id
        ORDER BY s.created_at DESC
      `;
      return res.status(200).json(rows);
    }

    const rows = await sql`
      SELECT s.*, ev.title AS event_title, ev.period::text AS event_period
      FROM bank_statements s
      LEFT JOIN events ev ON ev.id = s.event_id
      WHERE s.user_id = ${user.id}
      ORDER BY s.created_at DESC
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
      fileSize,
      eventId
    } = req.body || {};

    if (!originalFilename || !storageUrl) {
      return res.status(400).json({ error: "Missing file information" });
    }

    const prefix = statementPrefix(user.id);
    if (!isOwnedBlob(storagePath, prefix) || !isOwnedBlob(storageUrl, prefix)) {
      return res.status(400).json({ error: "Invalid file location" });
    }

    if (!eventId) {
      return res.status(400).json({ error: "Select what this upload is for" });
    }
    const [event] = await sql`
      SELECT id FROM events
      WHERE id = ${eventId}::uuid
        AND user_id = ${user.id}
        AND type IN ('bookkeeping', 'adhoc')
        AND submitted_at IS NULL
        AND status <> 'cancelled'
    `;
    if (!event) {
      return res.status(400).json({ error: "That upload request is not available" });
    }

    const [[statement]] = await sql.transaction([
      sql`
        INSERT INTO bank_statements (
          user_id,
          bank_code,
          original_filename,
          storage_url,
          storage_path,
          file_size,
          event_id
        )
        VALUES (
          ${user.id},
          'MAYBANK',
          ${originalFilename},
          ${storageUrl},
          ${storagePath || null},
          ${fileSize || null},
          ${eventId}::uuid
        )
        RETURNING *
      `,
      sql`
        UPDATE events
        SET submitted_at = now(),
            status = 'completed',
            return_date = CASE WHEN type = 'bookkeeping'
              THEN (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date + 15 ELSE return_date END
        WHERE id = ${eventId}::uuid
      `
    ]);

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
