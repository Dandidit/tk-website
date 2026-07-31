import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

export async function GET(request) {
  try {
    if (!process.env.CRON_SECRET) {
      console.error("CRON_SECRET is not configured.");
      return json({ message: "Server configuration error." }, 500);
    }

    const authorization = request.headers.get("authorization");
    if (authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return json({ message: "Unauthorized." }, 401);
    }

    const cleared = await sql`
      UPDATE consultation_submissions
      SET
        ip_address = NULL,
        user_agent = NULL,
        security_data_cleared_at = NOW()
      WHERE submitted_at < NOW() - INTERVAL '30 days'
        AND (ip_address IS NOT NULL OR user_agent IS NOT NULL)
      RETURNING id
    `;

    const deleted = await sql`
      DELETE FROM consultation_submissions
      WHERE submitted_at < NOW() - INTERVAL '2 years'
      RETURNING id
    `;

    return json({
      securityFieldsCleared: cleared.length,
      submissionsDeleted: deleted.length
    });
  } catch (error) {
    console.error("Cleanup failed:", error);
    return json({ message: "Cleanup failed." }, 500);
  }
}
