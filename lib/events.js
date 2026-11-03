// Shared helpers for events: recurrence + date math (dates are 'YYYY-MM-DD' strings).
const pad = n => String(n).padStart(2, "0");
export const fmt = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const addDays = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
export function addMonths(s, n) {
  const d = parse(s), day = d.getUTCDate();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return fmt(t);
}
export const todayKL = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
export const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || "") && fmt(parse(s)) === s;

// All occurrence dates from anchor (inclusive) up to min(until, horizon).
export function seriesDates(anchor, repeat, until, horizon) {
  const end = until && until < horizon ? until : horizon;
  const out = [];
  for (let i = 0; i < 1000; i++) {
    const d = repeat === "weekly" ? addDays(anchor, 7 * i)
      : repeat === "monthly" ? addMonths(anchor, i)
      : addMonths(anchor, 12 * i);
    if (d > end) break;
    out.push(d);
  }
  return out;
}
export const horizonFrom = today => addMonths(today, 12);
export const monthsBetween = (a, b) => (b.slice(0, 4) - a.slice(0, 4)) * 12 + (b.slice(5, 7) - a.slice(5, 7));
