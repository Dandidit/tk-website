import { neon } from "@neondatabase/serverless";
import { createRemoteJWKSet, jwtVerify } from "jose";

const sql = neon(process.env.terakira_db_DATABASE_URL);
const jwks = createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL));

export async function getAuthUser(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice(7);

  try {
    const { payload } = await jwtVerify(token, jwks);
    if (!payload.sub) return null;

    const rows = await sql`
      SELECT id, email, name, role
      FROM neon_auth."user"
      WHERE id = ${String(payload.sub)}
      LIMIT 1
    `;

    return rows[0] || null;
  } catch {
    return null;
  }
}

export async function requireAuth(req, res) {
  const user = await getAuthUser(req);

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  return user;
}

export async function requireAdmin(req, res) {
  const user = await requireAuth(req, res);

  if (!user) return null;

  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }

  return user;
}
