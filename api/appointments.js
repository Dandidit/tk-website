import { neon } from "@neondatabase/serverless";
import { requireAuth, requireAdmin } from "./_auth.js";

const sql = neon(process.env.terakira_db_DATABASE_URL);

export default async function handler(req, res) {
  if (req.method === "GET") {
    const user = await requireAuth(req, res);
    if (!user) return;

    const rows = user.role === "admin"
      ? await sql`
          SELECT a.*, u.email AS user_email, u.name AS user_name
          FROM appointments a
          JOIN neon_auth."user" u ON u.id = a.user_id
          ORDER BY a.start_at ASC
        `
      : await sql`
          SELECT *
          FROM appointments
          WHERE user_id = ${user.id}
          ORDER BY start_at ASC
        `;

    return res.status(200).json(rows);
  }

  if (req.method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { userId, title, startAt, endAt, notes } = req.body || {};

    if (!userId || !title || !startAt || !endAt) {
      return res.status(400).json({ error: "Missing appointment fields" });
    }

    const [row] = await sql`
      INSERT INTO appointments (
        user_id,
        title,
        start_at,
        end_at,
        notes,
        created_by
      )
      VALUES (
        ${userId},
        ${title},
        ${startAt},
        ${endAt},
        ${notes || null},
        ${admin.id}
      )
      RETURNING *
    `;

    return res.status(201).json(row);
  }

  if (req.method === "PATCH") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { id, status } = req.body || {};

    if (!id || !["scheduled", "completed", "cancelled"].includes(status)) {
      return res.status(400).json({ error: "Invalid appointment update" });
    }

    const [row] = await sql`
      UPDATE appointments
      SET status = ${status}
      WHERE id = ${id}
      RETURNING *
    `;

    return res.status(200).json(row);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
