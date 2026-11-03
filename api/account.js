import meHandler from "../lib/routes/me.js";
import adminProfileHandler from "../lib/routes/admin-profile.js";

export default async function handler(req, res) {
  const action = String(req.query?.action || "");
  if (action === "me") return meHandler(req, res);
  if (action === "admin-profile") return adminProfileHandler(req, res);
  return res.status(404).json({ error: "Unknown account action." });
}
