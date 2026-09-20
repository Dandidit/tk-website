import { get } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";
import { requireAuth } from "./_auth.js";

const sql = neon(process.env.terakira_db_DATABASE_URL);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).send("Method not allowed");
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const statementId = req.query.id;

  if (!statementId) {
    return res.status(400).send("Missing statement id");
  }

  const rows = user.role === "admin"
    ? await sql`SELECT storage_path FROM bank_statements WHERE id = ${statementId}`
    : await sql`
        SELECT storage_path
        FROM bank_statements
        WHERE id = ${statementId}
          AND user_id = ${user.id}
      `;

  const statement = rows[0];

  if (!statement?.storage_path) {
    return res.status(404).send("Statement not found");
  }

  const blob = await get(statement.storage_path, { access: "private" });

  if (!blob || blob.statusCode !== 200) {
    return res.status(404).send("File not found");
  }

  res.setHeader("Content-Type", blob.blob.contentType || "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="statement.pdf"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  const reader = blob.stream.getReader();

  res.on("close", () => reader.cancel().catch(() => {}));

  async function pipe() {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  }

  await pipe();
}
