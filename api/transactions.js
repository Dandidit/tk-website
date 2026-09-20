import { neon } from "@neondatabase/serverless";
import { requireAuth, requireAdmin } from "./_auth.js";

const sql = neon(process.env.terakira_db_DATABASE_URL);

export default async function handler(req, res) {
  if (req.method === "GET") {
    const user = await requireAuth(req, res);
    if (!user) return;

    const statementId = req.query.statementId;

    if (!statementId) {
      return res.status(400).json({ error: "statementId is required" });
    }

    const statementRows = user.role === "admin"
      ? await sql`SELECT * FROM bank_statements WHERE id = ${statementId}`
      : await sql`
          SELECT *
          FROM bank_statements
          WHERE id = ${statementId}
            AND user_id = ${user.id}
            AND reconciliation_published = TRUE
        `;

    if (!statementRows[0]) {
      return res.status(404).json({ error: "Statement not found" });
    }

    const rows = await sql`
      SELECT *
      FROM bank_transactions
      WHERE statement_id = ${statementId}
      ORDER BY transaction_date ASC, created_at ASC
    `;

    return res.status(200).json(rows);
  }

  if (req.method === "PATCH") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const {
      id,
      categoryMatch,
      action,
      reconciliationStatus,
      reconciliationNote
    } = req.body || {};

    if (!id) {
      return res.status(400).json({ error: "Transaction id is required" });
    }

    const [row] = await sql`
      UPDATE bank_transactions
      SET
        category_match = COALESCE(${categoryMatch ?? null}, category_match),
        action = COALESCE(${action ?? null}, action),
        reconciliation_status = COALESCE(${reconciliationStatus ?? null}, reconciliation_status),
        reconciliation_note = COALESCE(${reconciliationNote ?? null}, reconciliation_note),
        reconciled_by = CASE
          WHEN ${reconciliationStatus ?? null} = 'reconciled' THEN ${admin.id}
          ELSE reconciled_by
        END,
        reconciled_at = CASE
          WHEN ${reconciliationStatus ?? null} = 'reconciled' THEN NOW()
          ELSE reconciled_at
        END
      WHERE id = ${id}
      RETURNING *
    `;

    if (!row) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    return res.status(200).json(row);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
