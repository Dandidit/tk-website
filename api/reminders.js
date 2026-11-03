import { neon } from "@neondatabase/serverless";
import { sendMail, describe, TYPE_LABEL } from "../lib/mail.js";
import { seriesDates, horizonFrom, todayKL, monthsBetween, addMonths } from "../lib/events.js";

const sql = neon(process.env.terakira_db_DATABASE_URL);
const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request) {
  if (!process.env.CRON_SECRET) return json({ message: "Server configuration error." }, 500);
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return json({ message: "Unauthorized." }, 401);

  const today = todayKL();

  // 1. Extend open-ended series to 12 months ahead.
  const tails = await sql`
    SELECT DISTINCT ON (series_id) *, event_date::text AS event_date, period::text AS period,
           (SELECT min(event_date)::text FROM events x WHERE x.series_id = e.series_id) AS anchor
    FROM events e
    WHERE series_id IS NOT NULL AND repeat_until IS NULL
    ORDER BY series_id, event_date DESC
  `;
  let extended = 0;
  for (const t of tails) {
    const dates = seriesDates(t.anchor, t.repeat, null, horizonFrom(today)).filter(d => d > t.event_date);
    if (!dates.length) continue;
    const periods = dates.map(d => t.period ? addMonths(t.period, monthsBetween(t.event_date, d)) : d);
    await sql`
      INSERT INTO events (user_id, type, title, event_date, start_time, duration_min, period, return_date,
                          notes, repeat, repeat_until, series_id, created_by)
      SELECT ${t.user_id}::uuid, ${t.type}::text, ${t.title}::text, d, ${t.start_time}::time, ${t.duration_min}::int,
             CASE WHEN ${t.type}::text = 'bookkeeping' THEN p END,
             CASE WHEN ${t.type}::text = 'bookkeeping' THEN d + 15 END,
             ${t.notes}::text, ${t.repeat}::text, NULL, ${t.series_id}::uuid, ${t.created_by}::uuid
      FROM unnest(${dates}::date[], ${periods}::date[]) AS u(d, p)
    `;
    extended += dates.length;
  }

  // 2. Reminder emails 3, 2 and 1 days before the event date.
  const due = await sql`
    SELECT e.*, e.event_date::text AS event_date, e.start_time::text AS start_time,
           (e.event_date - ${today}::date) AS days_left, u.email, u.name
    FROM events e JOIN neon_auth."user" u ON u.id = e.user_id
    WHERE e.status <> 'cancelled'
      AND (e.event_date - ${today}::date) IN (1, 2, 3)
      AND NOT ((e.event_date - ${today}::date) = ANY (e.reminders_sent))
      AND (e.type IN ('appointment', 'reminder') OR e.submitted_at IS NULL)
  `;
  let sent = 0;
  for (const ev of due) {
    const ok = await sendMail({
      to: ev.email,
      subject: `${TYPE_LABEL[ev.type]} in ${ev.days_left} day${ev.days_left === 1 ? "" : "s"}: ${ev.title}`,
      lines: [`Hi ${ev.name || ""},`.trim(), `This is a reminder — ${ev.days_left} day${ev.days_left === 1 ? "" : "s"} to go.`, ...describe(ev)]
    });
    if (ok) {
      await sql`UPDATE events SET reminders_sent = array_append(reminders_sent, ${ev.days_left}::int) WHERE id = ${ev.id}::uuid`;
      sent++;
    }
  }

  return json({ extended, sent });
}
