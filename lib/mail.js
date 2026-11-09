import { Resend } from "resend";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));

export const SITE_URL = () => process.env.SITE_URL || "https://terakira.com";

// Brand colours (match css/variables.css)
const C = { ink: "#0B1830", muted: "#5A6475", line: "#E2DED3", page: "#F5F1E8", green: "#1E884A", soft: "#E7F5EC" };
const FONT = "Manrope,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";

// One shared branded layout. Table-based with inline styles so it renders in Gmail/Outlook.
// heading: big title; lines: paragraphs; details: [[label, value], ...]; cta: { label, url } | null; footnote: small grey text.
export function emailLayout({ heading, lines = [], details = [], cta, footnote }) {
  const site = SITE_URL();
  const p = t => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${C.ink}">${esc(t)}</p>`;
  const rows = details.filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) =>
    `<tr><td style="padding:8px 0;font-size:13px;color:${C.muted};width:110px;vertical-align:top">${esc(k)}</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:${C.ink}">${esc(v)}</td></tr>`).join("");
  const table = rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;background:${C.soft};border-radius:10px"><tr><td style="padding:10px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr></table>` : "";
  const button = cta ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 8px"><tr><td style="background:${C.green};border-radius:8px"><a href="${esc(cta.url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none">${esc(cta.label)}</a></td></tr></table>` : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:${C.page}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};font-family:${FONT}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 16px"><a href="${esc(site)}" style="text-decoration:none;color:${C.ink}"><img src="${esc(site)}/assets/logo.png" width="36" height="36" alt="" style="vertical-align:middle;border:0"> <span style="vertical-align:middle;font-size:20px;font-weight:800;letter-spacing:-.2px;color:${C.ink}">TeraKira</span></a></td></tr>
<tr><td style="background:#ffffff;border:1px solid ${C.line};border-top:4px solid ${C.green};border-radius:12px;padding:28px 28px 20px">
<h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:${C.ink}">${esc(heading)}</h1>
${lines.map(p).join("")}${table}${button}${footnote ? `<p style="margin:14px 0 0;font-size:13px;line-height:1.5;color:${C.muted}">${esc(footnote)}</p>` : ""}
</td></tr>
<tr><td style="padding:16px 8px 0;font-size:12px;line-height:1.6;color:${C.muted};text-align:center">TeraKira Bookkeeping &middot; <a href="${esc(site)}" style="color:${C.muted}">${esc(site.replace(/^https?:\/\//, ""))}</a><br>Questions? Just reply to this email.</td></tr>
</table></td></tr></table></body></html>`;
}

// Returns true on success, false on failure (never throws). Failures are logged with the recipient domain.
// Options: html (full body override), or heading/lines/details/cta/footnote for the branded layout.
// cta defaults to the portal link; pass cta: null (or portal: false) to omit it.
export async function sendMail({ to, subject, heading, lines = [], details = [], cta, footnote, html, replyTo, portal = true }) {
  if (!process.env.RESEND_API_KEY) { console.warn("sendMail skipped: RESEND_API_KEY not set"); return false; }
  if (!to) return false;
  const tag = `to=*@${String([].concat(to)[0]).split("@")[1] || "?"} subject="${subject}"`;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const button = cta !== undefined ? cta : portal ? { label: "Open your TeraKira portal", url: `${SITE_URL()}/dashboard.html` } : null;
    const body = html ?? emailLayout({ heading: heading || subject, lines, details, cta: button, footnote });
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "TeraKira <onboarding@resend.dev>",
      to,
      ...(replyTo || process.env.RESEND_REPLY_TO ? { replyTo: replyTo || process.env.RESEND_REPLY_TO } : {}),
      subject,
      html: body
    });
    if (error) { console.error(`Resend failed (${tag}):`, error); return false; }
    return true;
  } catch (e) {
    console.error(`Mail error (${tag}):`, e);
    return false;
  }
}

export const TYPE_LABEL = { bookkeeping: "Bookkeeping", appointment: "Appointment", adhoc: "Ad hoc upload", reminder: "Reminder" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  if (!m) return String(iso ?? "");
  const dow = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
  return `${DAYS[dow]}, ${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
}

// Per-type event content for the branded layout: { details, lines }.
export function eventContent(ev) {
  const time = ev.start_time ? String(ev.start_time).slice(0, 5) : "";
  const details = [
    ["Type", TYPE_LABEL[ev.type]],
    ["Title", ev.title],
    [ev.type === "bookkeeping" || ev.type === "adhoc" ? "Due date" : "Date", fmtDate(ev.event_date)],
    ["Time", time],
    ["Duration", ev.type === "appointment" && ev.duration_min ? `${ev.duration_min} minutes` : ""],
    ["Notes", ev.notes]
  ];
  const lines = [];
  if (ev.type === "bookkeeping" || ev.type === "adhoc") lines.push("Please upload the requested documents in the Documents tab of your portal before the due date.");
  if (ev.type === "appointment") lines.push("If you need to reschedule, just reply to this email.");
  return { details, lines };
}
