import { neon } from "@neondatabase/serverless";
import { requireAuth, requireAdmin } from "../auth.js";
import { addDays, isDate, seriesDates, horizonFrom, todayKL, monthsBetween, addMonths } from "../events.js";
import { sendMail, eventContent, TYPE_LABEL } from "../mail.js";

const sql = neon(process.env.terakira_db_DATABASE_URL);
const TYPES = ["bookkeeping", "appointment", "adhoc", "reminder"];
const REPEATS = ["weekly", "monthly", "yearly"];
const BOOKKEEPING_TITLE = "Monthly Bookkeeping Document";

function readFields(body) {
  const { type, title, eventDate, startTime, duration, period, notes, repeat, repeatUntil } = body || {};
  if (!TYPES.includes(type)) return { error: "Invalid event type" };
  if (!isDate(eventDate)) return { error: "Choose a valid date" };
  const f = { type, eventDate, notes: String(notes || "").trim().slice(0, 2000) || null, repeat: null, repeatUntil: null };
  f.title = type === "bookkeeping" ? BOOKKEEPING_TITLE : String(title || "").trim().slice(0, 160);
  if (!f.title) return { error: "Title is required" };
  if (type === "appointment") {
    if (!/^\d{2}:\d{2}$/.test(startTime || "")) return { error: "Choose a start time" };
    f.startTime = startTime;
    f.duration = Math.min(Math.max(Number(duration) || 60, 15), 480);
  }
  if (type === "bookkeeping") {
    const p = /^\d{4}-\d{2}$/.test(period || "") ? `${period}-01` : `${eventDate.slice(0, 7)}-01`;
    f.period = p;
  }
  if (repeat) {
    if (!REPEATS.includes(repeat)) return { error: "Invalid repeat option" };
    f.repeat = repeat;
    if (repeatUntil) {
      if (!isDate(repeatUntil) || repeatUntil < eventDate) return { error: "Repeat end date must be after the event date" };
      f.repeatUntil = repeatUntil;
    }
  }
  return { f };
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const user = await requireAuth(req, res);
    if (!user) return;

    if (user.role === "admin") {
      if (req.query?.clients) {
        const clients = await sql`
          SELECT id, name, email FROM neon_auth."user"
          WHERE COALESCE(role, '') <> 'admin' ORDER BY name, email
        `;
        return res.status(200).json(clients);
      }
      const userId = req.query?.userId || null;
      const rows = await sql`
        SELECT e.*, e.event_date::text AS event_date, e.start_time::text AS start_time, e.return_date::text AS return_date, e.period::text AS period, u.email AS user_email, u.name AS user_name
        FROM events e JOIN neon_auth."user" u ON u.id = e.user_id
        WHERE (${userId}::uuid IS NULL OR e.user_id = ${userId}::uuid)
        ORDER BY e.event_date ASC, e.start_time ASC NULLS FIRST
      `;
      return res.status(200).json(rows);
    }

    const rows = await sql`
      SELECT e.*, e.event_date::text AS event_date, e.start_time::text AS start_time, e.return_date::text AS return_date, e.period::text AS period
      FROM events e WHERE e.user_id = ${user.id}
      ORDER BY e.event_date ASC, e.start_time ASC NULLS FIRST
    `;
    return res.status(200).json(rows);
  }

  if (req.method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "Select a client" });
    const { f, error } = readFields(req.body);
    if (error) return res.status(400).json({ error });

    const [client] = await sql`SELECT id, email, name FROM neon_auth."user" WHERE id = ${userId}::uuid`;
    if (!client) return res.status(400).json({ error: "Client not found" });

    const dates = f.repeat ? seriesDates(f.eventDate, f.repeat, f.repeatUntil, horizonFrom(todayKL())) : [f.eventDate];
    const periods = dates.map(d => f.period ? addMonths(f.period, monthsBetween(f.eventDate, d)) : d);
    const seriesId = f.repeat ? crypto.randomUUID() : null;

    const rows = await sql`
      INSERT INTO events (user_id, type, title, event_date, start_time, duration_min, period, return_date,
                          notes, repeat, repeat_until, series_id, created_by)
      SELECT ${userId}::uuid, ${f.type}::text, ${f.title}::text, t.d, ${f.startTime || null}::time, ${f.duration || null}::int,
             CASE WHEN ${f.type}::text = 'bookkeeping' THEN t.p END,
             CASE WHEN ${f.type}::text = 'bookkeeping' THEN t.d + 15 END,
             ${f.notes}::text, ${f.repeat}::text, ${f.repeatUntil}::date, ${seriesId}::uuid, ${admin.id}::uuid
      FROM unnest(${dates}::date[], ${periods}::date[]) AS t(d, p)
      RETURNING *, event_date::text AS event_date, start_time::text AS start_time
    `;

    const content = eventContent(rows[0]);
    const emailed = await sendMail({
      to: client.email,
      subject: `New ${TYPE_LABEL[f.type].toLowerCase()} from TeraKira`,
      heading: `New ${TYPE_LABEL[f.type].toLowerCase()} scheduled`,
      lines: [`Hi ${client.name || "there"},`, "TeraKira has added the following to your account:", ...content.lines],
      details: [...content.details, ["Repeats", f.repeat || ""]]
    });

    if (!emailed) res.setHeader("X-Email-Sent", "false");
    return res.status(201).json(rows);
  }

  if (req.method === "PATCH") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { id, scope } = req.body || {};
    const [current] = id ? await sql`SELECT *, event_date::text AS event_date FROM events WHERE id = ${id}::uuid` : [];
    if (!current) return res.status(404).json({ error: "Event not found" });

    const { f, error } = readFields({ ...req.body, type: current.type });
    if (error) return res.status(400).json({ error });

    if (scope === "future" && current.series_id) {
      if (f.eventDate !== current.event_date) {
        return res.status(400).json({ error: "Date changes apply to this event only" });
      }
      const rows = await sql`
        UPDATE events SET title = ${f.title}, notes = ${f.notes},
          start_time = ${f.startTime || null}::time, duration_min = ${f.duration || null}::int
        WHERE series_id = ${current.series_id}::uuid AND event_date >= ${current.event_date}::date
        RETURNING *
      `;
      return res.status(200).json(rows);
    }

    const [row] = await sql`
      UPDATE events SET title = ${f.title}, notes = ${f.notes}, event_date = ${f.eventDate}::date,
        start_time = ${f.startTime || null}::time, duration_min = ${f.duration || null}::int,
        period = CASE WHEN type = 'bookkeeping' THEN ${f.period || null}::date END,
        return_date = CASE WHEN type = 'bookkeeping' AND submitted_at IS NULL THEN ${f.eventDate}::date + 15 ELSE return_date END,
        reminders_sent = '{}'
      WHERE id = ${id}::uuid
      RETURNING *
    `;
    return res.status(200).json([row]);
  }

  if (req.method === "DELETE") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const id = req.query?.id;
    const [current] = id ? await sql`SELECT *, event_date::text AS event_date FROM events WHERE id = ${id}::uuid` : [];
    if (!current) return res.status(404).json({ error: "Event not found" });

    if (req.query?.scope === "future" && current.series_id) {
      await sql`DELETE FROM events WHERE series_id = ${current.series_id}::uuid AND event_date >= ${current.event_date}::date`;
    } else {
      await sql`DELETE FROM events WHERE id = ${id}::uuid`;
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
