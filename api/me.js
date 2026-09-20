import { requireAuth } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  res.status(200).json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role || "user"
  });
}
