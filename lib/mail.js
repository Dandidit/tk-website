import { Resend } from "resend";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));

export async function sendMail({ to, subject, lines }) {
  if (!process.env.RESEND_API_KEY || !to) return false;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "TeraKira <onboarding@resend.dev>",
      to,
      subject,
      html: `<div style="font-family:system-ui,sans-serif;line-height:1.5">${lines.map(l => `<p>${esc(l)}</p>`).join("")}<p><a href="${esc(process.env.SITE_URL || "https://terakira.com")}/dashboard.html">Open your TeraKira portal</a></p></div>`
    });
    if (error) { console.error("Resend failed:", error); return false; }
    return true;
  } catch (e) {
    console.error("Mail error:", e);
    return false;
  }
}

export const TYPE_LABEL = { bookkeeping: "Bookkeeping", appointment: "Appointment", adhoc: "Ad hoc upload", reminder: "Reminder" };

export function describe(ev) {
  const parts = [`${TYPE_LABEL[ev.type]}: ${ev.title}`, `Date: ${ev.event_date}${ev.start_time ? ` ${String(ev.start_time).slice(0, 5)}` : ""}`];
  if (ev.type === "bookkeeping" || ev.type === "adhoc") parts.push("Please upload the requested documents in the Documents tab before this date.");
  if (ev.notes) parts.push(`Notes: ${ev.notes}`);
  return parts;
}
