/* Shared onboarding checklist model: used by the onboarding wizard and the dashboard
   so both always count the same 22 items the same way. Every function takes the
   onboarding state `S` ({ ans, co, items, comms, sig }) as its first argument. */

export const holdersTotal = S => S.co.holders.reduce((a, h) => a + (parseFloat(h.pct) || 0), 0);

export const ITEMS = {
  c_name: { sec: 'company', label: 'Company name and entity type', check: S => S.co.name.trim() && S.co.entity },
  c_ssm: { sec: 'company', label: 'SSM registration number', check: S => S.co.ssm.trim() },
  c_tin: { sec: 'company', label: 'Income tax number (LHDN TIN)', check: S => S.co.tin.trim() },
  c_addr: { sec: 'company', label: 'Registered address and contact', check: S => S.co.addr.trim() && S.co.contact.trim() && (S.co.phone.trim() || S.co.email.trim()) },
  c_fye: { sec: 'company', label: 'Financial year end', check: S => S.co.fye },
  c_hold: { sec: 'company', label: 'Directors and shareholders', check: S => S.co.holders.every(h => h.name.trim()) && Math.round(holdersTotal(S) * 100) === 10000 },
  d_ssm: { sec: 'docs', label: 'SSM incorporation documents', help: 'Form 9, Form 13 or Superform.', mode: 'file' },
  d_tax: { sec: 'docs', label: 'Last year’s tax return', help: 'Form C, Form B or Form P.', mode: 'file' },
  d_fs: { sec: 'docs', label: 'Last year’s financial statements', help: 'Only if you have them.', mode: 'file' },
  d_bank: { sec: 'docs', label: 'Bank statements', help: 'Up to the last 12 months, or everything since the account opened.', mode: 'file' },
  d_pay: { sec: 'docs', label: 'Payroll records', help: 'EA forms, EPF, SOCSO, EIS and PCB.', mode: 'file' },
  d_loan: { sec: 'docs', label: 'Hire purchase and loan agreements', mode: 'file' },
  d_asset: { sec: 'docs', label: 'List of business assets', help: 'Equipment, vehicles and anything else you own for the business. A photo of a handwritten list is fine.', mode: 'file' },
  d_sst: { sec: 'docs', label: 'SST registration details', help: 'Certificate or registration number.', mode: 'file' },
  a_soft: { sec: 'access', label: 'Accounting software login', help: 'Terakira sets this up and invites you.', team: true },
  a_inv: { sec: 'access', label: 'Invoice template', help: 'Terakira prepares one with your branding.', team: true },
  a_bank: { sec: 'access', label: 'Read-only bank feed', help: 'Lets Terakira see transactions. Nobody can move money.', mode: 'tap', cta: 'Share bank access', done: 'Access shared' },
  a_pay: { sec: 'access', label: 'Payroll system access', mode: 'tap', cta: 'Share payroll access', done: 'Access shared' },
  a_prior: { sec: 'access', label: 'Company secretary or previous accountant', help: 'So we can collect old records on your behalf.', mode: 'text', ph: 'Name, firm and phone or email', cta: 'Save contact' },
  s_letter: { sec: 'start', label: 'Signed engagement letter' },
  s_dep: { sec: 'start', label: 'Initial payment' },
  s_comms: { sec: 'start', label: 'How we keep in touch', check: S => S.comms }
};
export const ID_ORDER = Object.keys(ITEMS);

export function autoNA(S, id) {
  const a = S.ans;
  switch (id) {
    case 'd_tax': return a.newCo === true ? 'New business, so there is no earlier return to send.' : null;
    case 'd_fs': return a.newCo === true ? 'New business, so there are no earlier statements.' : null;
    case 'a_prior': return a.newCo === true ? 'New business, so there is no previous accountant.' : null;
    case 'd_bank': return a.bank === 'none' ? 'The account is new and has no statements yet.' : null;
    case 'd_pay': case 'a_pay': return a.payroll === false ? 'Terakira isn’t handling your payroll.' : null;
    case 'd_loan': return a.loans === false ? 'No hire purchase or loans.' : null;
    case 'd_sst': return a.sst === false ? 'Sales under RM500,000, so SST registration usually isn’t needed.' : null;
  }
  return null;
}
export const SETTLED = ['done', 'na', 'team', 'review'];

export function status(S, id) {
  const it = ITEMS[id], o = (S.items && S.items[id]) || {};
  if (it.check) { if (it.check(S)) return 'done'; return o.status === 'later' ? 'later' : 'todo'; }
  if (o.status) return o.status;
  if (it.team) return 'team';
  if (autoNA(S, id)) return 'na';
  return 'todo';
}

export function stats(S, sec) {
  const ids = ID_ORDER.filter(i => !sec || ITEMS[i].sec === sec);
  const done = ids.filter(i => SETTLED.includes(status(S, i))).length;
  return { done, total: ids.length, open: ids.filter(i => !SETTLED.includes(status(S, i))) };
}
