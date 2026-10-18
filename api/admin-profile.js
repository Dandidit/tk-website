import { neon } from "@neondatabase/serverless";
import { requireAdmin } from "./_auth.js";

const sql = neon(process.env.terakira_db_DATABASE_URL);

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const userId = String(req.query?.userId || "").trim();
  if (!userId) return res.status(400).json({ error: "Missing user ID." });

  try {
    const [[user], [onboarding], owners, items] = await Promise.all([
      sql`SELECT id, name, email FROM neon_auth."user" WHERE id = ${userId} LIMIT 1`,
      sql`SELECT * FROM public.onboarding WHERE user_id = ${userId} LIMIT 1`,
      sql`SELECT name, ownership_pct FROM public.onboarding_owners WHERE user_id = ${userId} ORDER BY created_at, id`,
      sql`SELECT item_id, status, note, file_url, file_name, updated_at FROM public.onboarding_items WHERE user_id = ${userId} ORDER BY item_id`
    ]);

    if (!user) return res.status(404).json({ error: "Client not found." });
    return res.status(200).json({
      user,
      onboarding: onboarding || null,
      owners,
      items: items.map(item => ({
        ...item,
        has_file: !!item.file_url,
        file_url: undefined
      }))
    });
  } catch (error) {
    console.error("Admin profile fetch failed:", error);
    return res.status(500).json({ error: "Unable to load client profile." });
  }
}
