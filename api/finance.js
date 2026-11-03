import statementsHandler from "../lib/routes/statements.js";
import transactionsHandler from "../lib/routes/transactions.js";

export default async function handler(req, res) {
  const action = String(req.query?.action || "");
  if (action === "statements") return statementsHandler(req, res);
  if (action === "transactions") return transactionsHandler(req, res);
  return res.status(404).json({ error: "Unknown finance action." });
}
