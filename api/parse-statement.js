import { neon } from "@neondatabase/serverless";
import { requireAuth } from "./_auth.js";

const sql = neon(process.env.terakira_db_DATABASE_URL);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const { statementId } = req.body || {};

  if (!statementId) {
    return res.status(400).json({ error: "statementId is required" });
  }

  const [statement] = await sql`
    SELECT *
    FROM bank_statements
    WHERE id = ${statementId}
  `;

  if (!statement) {
    return res.status(404).json({ error: "Statement not found" });
  }

  if (user.role !== "admin" && statement.user_id !== user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  await sql`
    UPDATE bank_statements
    SET parse_status = 'processing', parse_error = NULL
    WHERE id = ${statementId}
  `;

  try {
    const parserUrl = new URL("/api/parse-mae.py", process.env.APP_URL).toString();

    const response = await fetch(parserUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-parser-secret": process.env.PARSER_SECRET
      },
      body: JSON.stringify({
        statementId,
        storagePath: statement.storage_path
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Parser failed");
    }

    const saveUrl = new URL("/api/parsed-transactions", process.env.APP_URL).toString();

    const saveResponse = await fetch(saveUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-parser-secret": process.env.PARSER_SECRET
      },
      body: JSON.stringify(result)
    });

    const saveResult = await saveResponse.json();

    if (!saveResponse.ok) {
      throw new Error(saveResult.error || "Unable to save parser result");
    }

    return res.status(200).json(saveResult);
  } catch (error) {
    await sql`
      UPDATE bank_statements
      SET parse_status = 'failed', parse_error = ${error.message}
      WHERE id = ${statementId}
    `;

    return res.status(500).json({ error: error.message });
  }
}
