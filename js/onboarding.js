const KEY = 'terakira-onboarding-v1';
const blank = () => ({
  step: 0, tab: 'app',
  ans: { newCo: null, bank: null, payroll: null, loans: null, sst: null },
  co: { name:'', entity:'', ssm:'', tin:'', addr:'', contact:'', phone:'', email:'', fye:'', holders:[{name:'',pct:''}] },
  items: {}, comms: '', sig: ''
});
function load(){
  try{ const r = localStorage.getItem(KEY); if(r){ const o = JSON.parse(r); return Object.assign(blank(), o); } }catch(e){}
  return blank();
}
let S = load();
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }

const STEPS = ['welcome','tailor','company','docs','access','start','review'];
const TITLES = { tailor:'Your business', company:'Company details', docs:'Documents', access:'Access and accounts', start:'Before we start', review:'Review' };
const SECTIONS = { company:'Company details', docs:'Documents', access:'Access and accounts', start:'Before we start' };
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const holdersTotal = () => S.co.holders.reduce((a,h)=>a+(parseFloat(h.pct)||0),0);

/* ---------- checklist model ---------- */
const co = () => S.co;
const ITEMS = {
  c_name:  { sec:'company', label:'Company name and entity type', check:()=>co().name.trim() && co().entity },
  c_ssm:   { sec:'company', label:'SSM registration number', check:()=>co().ssm.trim() },
  c_tin:   { sec:'company', label:'Income tax number (LHDN TIN)', check:()=>co().tin.trim() },
  c_addr:  { sec:'company', label:'Registered address and contact', check:()=>co().addr.trim() && co().contact.trim() && (co().phone.trim() || co().email.trim()) },
  c_fye:   { sec:'company', label:'Financial year end', check:()=>co().fye },
  c_hold:  { sec:'company', label:'Directors and shareholders', check:()=>co().holders.every(h=>h.name.trim()) && Math.round(holdersTotal()*100)===10000 },
  d_ssm:   { sec:'docs', label:'SSM incorporation documents', help:'Form 9, Form 13 or Superform.', mode:'file' },
  d_tax:   { sec:'docs', label:'Last year’s tax return', help:'Form C, Form B or Form P.', mode:'file' },
  d_fs:    { sec:'docs', label:'Last year’s financial statements', help:'Only if you have them.', mode:'file' },
  d_bank:  { sec:'docs', label:'Bank statements', help:'Up to the last 12 months, or everything since the account opened.', mode:'file' },
  d_pay:   { sec:'docs', label:'Payroll records', help:'EA forms, EPF, SOCSO, EIS and PCB.', mode:'file' },
  d_loan:  { sec:'docs', label:'Hire purchase and loan agreements', mode:'file' },
  d_asset: { sec:'docs', label:'List of business assets', help:'Equipment, vehicles and anything else you own for the business. A photo of a handwritten list is fine.', mode:'file' },
  d_sst:   { sec:'docs', label:'SST registration details', help:'Certificate or registration number.', mode:'file' },
  a_soft:  { sec:'access', label:'Accounting software login', help:'Terakira sets this up and invites you.', team:true },
  a_inv:   { sec:'access', label:'Invoice template', help:'Terakira prepares one with your branding.', team:true },
  a_bank:  { sec:'access', label:'Read-only bank feed', help:'Lets Terakira see transactions. Nobody can move money.', mode:'tap', cta:'Share bank access', done:'Access shared' },
  a_pay:   { sec:'access', label:'Payroll system access', mode:'tap', cta:'Share payroll access', done:'Access shared' },
  a_prior: { sec:'access', label:'Company secretary or previous accountant', help:'So we can collect old records on your behalf.', mode:'text', ph:'Name, firm and phone or email', cta:'Save contact' },
  s_letter:{ sec:'start', label:'Signed engagement letter' },
  s_dep:   { sec:'start', label:'Initial payment' },
  s_comms: { sec:'start', label:'How we keep in touch', check:()=>S.comms }
};
const ID_ORDER = Object.keys(ITEMS);

function autoNA(id){
  const a = S.ans;
  switch(id){
    case 'd_tax': return a.newCo===true ? 'New business, so there is no earlier return to send.' : null;
    case 'd_fs': return a.newCo===true ? 'New business, so there are no earlier statements.' : null;
    case 'a_prior': return a.newCo===true ? 'New business, so there is no previous accountant.' : null;
    case 'd_bank': return a.bank==='none' ? 'The account is new and has no statements yet.' : null;
    case 'd_pay': case 'a_pay': return a.payroll===false ? 'Terakira isn’t handling your payroll.' : null;
    case 'd_loan': return a.loans===false ? 'No hire purchase or loans.' : null;
    case 'd_sst': return a.sst===false ? 'Sales under RM500,000, so SST registration usually isn’t needed.' : null;
  }
  return null;
}
function status(id){
  const it = ITEMS[id], o = S.items[id] || {};
  if(it.check){ if(it.check()) return 'done'; return o.status==='later' ? 'later' : 'todo'; }
  if(o.status) return o.status;
  if(it.team) return 'team';
  if(autoNA(id)) return 'na';
  return 'todo';
}
const SETTLED = ['done','na','team','review'];
function stats(sec){
  const ids = ID_ORDER.filter(i => !sec || ITEMS[i].sec===sec);
  const done = ids.filter(i => SETTLED.includes(status(i))).length;
  return { done, total: ids.length, open: ids.filter(i=>!SETTLED.includes(status(i))) };
}
const STATE_TEXT = { todo:'Needed', later:'You’ll send this later', done:'Received', na:'Not needed', team:'Terakira is preparing this', review:'Terakira will confirm' };

/* ---------- chrome ---------- */
function chrome(){
  const s = stats();
  const idx = STEPS.indexOf(S.step_id || STEPS[S.step]);
  const st = STEPS[S.step];
  document.getElementById('tab-app').setAttribute('aria-selected', S.tab==='app');
  document.getElementById('tab-flow').setAttribute('aria-selected', S.tab==='flow');
  const strip = document.getElementById('strip');
  if(S.tab!=='app' || st==='welcome'){ strip.innerHTML=''; strip.style.display='none'; }
  else{
    strip.style.display='flex';
    strip.innerHTML = `<div class="where">Step <b>${S.step}</b> of 6 · ${TITLES[st]}</div>
      <div class="bal" aria-label="${s.done} of ${s.total} items settled"><span class="n">${s.done}<small>/${s.total}</small></span><span class="l">items settled</span></div>`;
  }
  const rail = document.getElementById('rail');
  if(rail){
    rail.innerHTML = '<ol>' + STEPS.slice(1).map((id,i)=>{
      const c = SECTIONS[id] ? stats(id) : null;
      const full = c && c.done===c.total;
      return `<li><button data-act="go" data-i="${i+1}" ${STEPS[S.step]===id?'aria-current="step"':''}><span>${TITLES[id]}</span>${c?`<span class="ct ${full?'full':''}">${c.done}/${c.total}</span>`:''}</button></li>`;
    }).join('') + '</ol>';
  }
}

/* ---------- view helpers ---------- */
function row(id, inner){
  const s = status(id), it = ITEMS[id];
  const glyph = {done:'✓',na:'–',team:'…',review:'…',todo:'',later:''}[s];
  const reason = s==='na' ? (autoNA(id) && !(S.items[id]&&S.items[id].status) ? autoNA(id) : 'You marked this as not needed.') : '';
  return `<li class="row" data-s="${s}"><div class="mark" aria-hidden="true">${glyph}</div><div>
    <div class="title">${it.label}</div>${it.help?`<div class="help">${it.help}</div>`:''}
    <div class="state">${s==='na'?reason:STATE_TEXT[s]}${s==='done'&&S.items[id]&&S.items[id].note?` · ${esc(S.items[id].note)}`:''}</div>
    ${inner||''}</div></li>`;
}
function laterCtl(id){
  const s = status(id);
  if(s==='later') return `<button class="link" data-act="undo" data-id="${id}">Undo</button>`;
  if(s==='todo') return `<button class="link" data-act="later" data-id="${id}">I’ll send this later</button>`;
  return '';
}
function actionRow(id){
  const it = ITEMS[id], s = status(id);
  if(it.team) return row(id);
  let acts = '';
  if(s==='na'){
    acts = `<div class="acts"><button class="link" data-act="apply" data-id="${id}">This does apply</button></div>`;
  } else if(s==='done'){
    acts = `<div class="acts">${it.mode==='file'?`<label class="btn quiet small">Replace file<input class="sr" type="file" data-file="${id}"></label>`:''}<button class="link" data-act="undo" data-id="${id}">Remove</button></div>`;
  } else {
    let main = '';
    if(it.mode==='file') main = `<label class="btn small">Upload file<input class="sr" type="file" data-file="${id}"></label>`;
    if(it.mode==='tap') main = `<button class="btn small" data-act="tap" data-id="${id}">${it.cta}</button>`;
    if(it.mode==='text') main = `<input type="text" style="max-width:340px" placeholder="${it.ph}" data-txt="${id}" aria-label="${it.label}"><button class="btn small" data-act="savetxt" data-id="${id}">${it.cta}</button>`;
    acts = `<div class="acts">${main}${s==='todo'?`<button class="link" data-act="later" data-id="${id}">Send later</button>`:`<button class="link" data-act="undo" data-id="${id}">Undo</button>`}<button class="link" data-act="na" data-id="${id}">Doesn’t apply</button></div>`;
  }
  return row(id, acts);
}
function group(sec, ids, extra){
  const c = stats(sec);
  return `<div class="group"><h2>${SECTIONS[sec]}</h2><span class="c">${c.done} of ${c.total} settled</span></div><ul class="rows">${ids.map(i=>actionRow(i)).join('')}${extra||''}</ul>`;
}
function fld(label, control, hint, id){
  return `<div class="field"><label ${id?`for="${id}"`:''}>${label}</label>${control}${hint?`<div class="hint">${hint}</div>`:''}</div>`;
}
function inp(path, type, extra=''){
  const v = path.split('.').reduce((o,k)=>o[k], S);
  return `<input id="f-${path.replace('.','-')}" type="${type}" data-f="${path}" value="${esc(v)}" ${extra}>`;
}

/* ---------- steps ---------- */
const V = {};
V.welcome = () => `
  <h1 tabindex="-1">Let’s get your books set up</h1>
  <p class="lede">Terakira needs a few details and documents before we start your bookkeeping. This takes about 10 minutes. Your answers save as you go, so you can stop and come back.</p>
  <ul class="welcome-steps">
    <li>Tell us about your business<span>1 min</span></li>
    <li>Company details<span>3 min</span></li>
    <li>Documents<span>4 min</span></li>
    <li>Access and accounts<span>1 min</span></li>
    <li>Sign and confirm<span>1 min</span></li>
  </ul>
  <p class="lede" style="margin-bottom:12px">Missing something? Choose “Send later” and keep going. Nothing blocks you.</p>
  <button class="link" data-act="demo" style="padding-left:0">Load example: Street Shawarma</button>`;

function qBlock(key, title, hint, opts){
  return `<div class="q" role="radiogroup" aria-label="${title}"><div class="qt">${title}</div>${hint?`<div class="hint">${hint}</div>`:''}<div class="pills">${opts.map(([lab,val])=>`<button class="pill" role="radio" aria-checked="${S.ans[key]===val}" data-act="ans" data-k="${key}" data-v="${val}">${lab}</button>`).join('')}</div></div>`;
}
V.tailor = () => `
  <h1 tabindex="-1">Tell us about your business</h1>
  <p class="lede">Five quick questions. We use your answers to hide anything you don’t need to send.</p>
  ${qBlock('newCo','Is this a new business with no earlier tax filings?','',[['Yes, it’s new',true],['No, it has filed before',false]])}
  ${qBlock('bank','How long has your business bank account been open?','',[['12 months or more','12'],['Less than 12 months','less'],['Just opened, no statements yet','none']])}
  ${qBlock('payroll','Will Terakira handle your payroll?','',[['Yes',true],['No',false]])}
  ${qBlock('loans','Does the business have hire purchase or loan agreements?','',[['Yes',true],['No',false]])}
  ${qBlock('sst','Do you expect sales above RM500,000 a year?','That’s usually where SST registration comes into play. We’ll confirm with you.',[['Yes',true],['No',false]])}`;

V.company = () => {
  const c = S.co, t = holdersTotal();
  const hl = c.entity==='Sdn Bhd'||c.entity==='LLP' ? 'Directors and shareholders' : (c.entity ? 'Owners and partners' : 'Directors, shareholders or owners');
  const holders = c.holders.map((h,i)=>`<div class="holder"><input type="text" aria-label="Name ${i+1}" placeholder="Full name" data-h="${i}" data-hk="name" value="${esc(h.name)}"><input type="number" inputmode="decimal" min="0" max="100" aria-label="Shareholding percent ${i+1}" placeholder="%" data-h="${i}" data-hk="pct" value="${esc(h.pct)}">${c.holders.length>1?`<button class="x" aria-label="Remove person ${i+1}" data-act="delh" data-i="${i}">×</button>`:'<span></span>'}</div>`).join('');
  return `
  <h1 tabindex="-1">Company details</h1>
  <p class="lede">Keep your SSM certificate and LHDN details handy. Skip anything you don’t have yet.</p>
  ${fld('Legal company name', inp('co.name','text','autocomplete="organization"'), 'As shown on your SSM certificate.', 'f-co-name')}
  ${fld('Entity type', `<select id="f-co-entity" data-f="co.entity" data-rerender="1"><option value="">Choose one</option>${['Sole proprietorship','Partnership','Sdn Bhd','LLP'].map(o=>`<option ${c.entity===o?'selected':''}>${o}</option>`).join('')}</select>`, '', 'f-co-entity')}
  ${fld('SSM registration number', inp('co.ssm','text','inputmode="numeric"'), '12 digits, printed on your SSM certificate.', 'f-co-ssm')}
  <div class="field"><label for="f-co-tin">Income tax number (LHDN TIN)</label>${inp('co.tin','text','autocapitalize="characters"')}<div class="hint">Find it in MyTax. Companies start with C, individuals with IG.</div>${status('c_tin')==='todo'?`<button class="link" data-act="later" data-id="c_tin" style="padding-left:0">I’ll send this later</button>`:status('c_tin')==='later'?`<div class="hint">You’ll send this later. <button class="link" data-act="undo" data-id="c_tin">Undo</button></div>`:''}</div>
  ${fld('Registered address', `<textarea id="f-co-addr" data-f="co.addr" autocomplete="street-address">${esc(c.addr)}</textarea>`, '', 'f-co-addr')}
  ${fld('Main contact name', inp('co.contact','text','autocomplete="name"'), '', 'f-co-contact')}
  <div class="two">${fld('Phone or WhatsApp number', inp('co.phone','tel','autocomplete="tel"'), '', 'f-co-phone')}${fld('Email', inp('co.email','email','autocomplete="email"'), '', 'f-co-email')}</div>
  ${fld('Financial year ends in', `<select id="f-co-fye" data-f="co.fye"><option value="">Choose a month</option>${MONTHS.map(m=>`<option ${c.fye===m?'selected':''}>${m}</option>`).join('')}</select>`, 'The last day of that month is your year end.', 'f-co-fye')}
  <div class="field"><span class="lab">${hl}</span>${holders}<div class="total ${Math.round(t*100)===10000?'ok':'bad'}" id="hTotal" aria-live="polite">${htext(t)}</div><button class="btn quiet small" data-act="addh">Add another person</button></div>`;
};
function htext(t){ const r = Math.round(t*100)/100; return r===100 ? 'Total 100%' : `Total ${r}%. Needs to add up to 100%.`; }

V.docs = () => group('docs', ID_ORDER.filter(i=>ITEMS[i].sec==='docs'));
V.access = () => `<h1 tabindex="-1">Access and accounts</h1><p class="lede">Terakira sets up your accounting software and invoice template. You only share what we can’t reach ourselves.</p>` + group('access', ID_ORDER.filter(i=>ITEMS[i].sec==='access'));

V.start = () => {
  const l = S.items.s_letter||{}, sl = status('s_letter'), sd = status('s_dep');
  const letter = sl==='done'
    ? row('s_letter','')
    : row('s_letter', `<div class="acts"><input type="text" style="max-width:300px" placeholder="Type your full name to sign" value="${esc(S.sig)}" data-sig aria-label="Full name to sign"><button class="btn small" data-act="sign">Sign letter</button></div><div class="help" style="margin-top:8px">By signing you accept the engagement terms Terakira sent you.</div>`);
  const dep = sd==='review'
    ? row('s_dep', `<div class="acts"><button class="link" data-act="undo" data-id="s_dep">Undo</button></div>`)
    : row('s_dep', `<div class="help">Terakira sent an invoice for the starting deposit.</div><div class="acts"><button class="btn quiet small" data-act="invoice">View invoice</button><button class="btn small" data-act="paid">I’ve paid</button></div>`);
  const comms = row('s_comms', `<div class="pills" role="radiogroup" aria-label="Preferred communication" style="margin-top:12px">${['WhatsApp group','Email','Phone call'].map(o=>`<button class="pill" role="radio" aria-checked="${S.comms===o}" data-act="comms" data-v="${o}">${o}</button>`).join('')}</div>`);
  return `<h1 tabindex="-1">Before we start</h1><p class="lede">Sign, pay and choose how we talk. Then we can begin.</p>
  <div class="group"><h2>${SECTIONS.start}</h2><span class="c">${stats('start').done} of ${stats('start').total} settled</span></div><ul class="rows">${letter}${dep}${comms}</ul>`;
};

V.review = () => {
  const s = stats(), open = s.open;
  const jump = { company:2, docs:3, access:4, start:5 };
  const nm = S.co.name.trim();
  return `
  <h1 tabindex="-1">${open.length? `${open.length} ${open.length===1?'item is':'items are'} still open` : 'Everything is settled'}</h1>
  <p class="lede">${nm?esc(nm)+': ':''}${open.length ? 'You can leave these for now. Terakira will remind you' + (S.comms?` on ${esc(S.comms)}`:'') + '.' : 'Terakira has what it needs to start.'}</p>
  ${open.length?`<div class="group"><h2>Still open</h2><span class="c">${open.length}</span></div><ul class="rows">${open.map(i=>`<li class="row" data-s="${status(i)}"><div class="mark" aria-hidden="true"></div><div><div class="title">${ITEMS[i].label}</div><div class="state">${STATE_TEXT[status(i)]}</div><div class="acts"><button class="link" data-act="go" data-i="${jump[ITEMS[i].sec]}">Go to ${SECTIONS[ITEMS[i].sec].toLowerCase()}</button></div></div></li>`).join('')}</ul>`:''}
  <div class="group"><h2>What Terakira does next</h2></div>
  <ol class="next-list">
    <li>Sets up your accounting software and sends you the login.</li>
    <li>Prepares your invoice template.</li>
    ${status('s_dep')==='review'?'<li>Confirms your deposit once it arrives.</li>':''}
    <li>${S.comms?`Messages you on ${esc(S.comms)}`:'Messages you'} when your books are ready to start.</li>
  </ol>
  <div class="group"><h2>Settled so far</h2><span class="c">${s.done} of ${s.total}</span></div>
  <ul class="rows">${ID_ORDER.filter(i=>SETTLED.includes(status(i))).map(i=>`<li class="row" data-s="${status(i)}"><div class="mark" aria-hidden="true">${status(i)==='done'?'✓':status(i)==='na'?'–':'…'}</div><div><div class="title">${ITEMS[i].label}</div><div class="state">${STATE_TEXT[status(i)]}</div></div></li>`).join('')}</ul>`;
};

/* flow map */
function flowView(){
  return `<div class="flow"><main id="main" tabindex="-1">
  <h1 tabindex="-1">Onboarding flow</h1>
  <p class="lede">The path a new Terakira client takes, based on your onboarding checklist. Every step lets people skip and return, so nobody gets stuck waiting on a missing document.</p>
  <ol class="flow-list">
    <li class="node"><div class="meta">Terakira sends</div><h3>Invite link</h3><p>Sent on WhatsApp or email after the engagement letter is agreed. One tap opens the client’s own checklist. No password needed to start.</p></li>
    <li class="node"><div class="meta">Screen</div><h3>Welcome</h3><p>Sets expectations: about 10 minutes, saves automatically, missing items can wait.</p></li>
    <li class="node"><div class="meta">Screen · 5 questions</div><h3>Tell us about your business</h3><p>Answers decide which checklist items appear. This is why a new business never sees a request for last year’s tax return.</p>
      <div class="scroll-x"><table class="rules"><thead><tr><th>Answer</th><th>Effect</th></tr></thead><tbody>
      <tr><td>New business</td><td>Hides last year’s return, financial statements and previous accountant.</td></tr>
      <tr><td>Bank account just opened</td><td>Hides bank statements. Older accounts send up to 12 months.</td></tr>
      <tr><td>Terakira doesn’t handle payroll</td><td>Hides payroll records and payroll system access.</td></tr>
      <tr><td>No loans or hire purchase</td><td>Hides loan agreements.</td></tr>
      <tr><td>Sales under RM500,000</td><td>Hides SST registration details.</td></tr></tbody></table></div>
      <p style="margin-top:10px">Hidden items stay visible as “Not needed” with the reason, and the client can reverse them.</p></li>
    <li class="node"><div class="meta">Screen</div><h3>Company details</h3><p>Name, entity type, SSM number, TIN, address, contact, year end, and owners whose shares must total 100%. Fields that need a fix show a plain message, never a block.</p></li>
    <li class="node"><div class="meta">Screen</div><h3>Documents</h3><p>One row per document. Each row offers Upload, Send later or Doesn’t apply.</p></li>
    <li class="node"><div class="meta">Screen</div><h3>Access and accounts</h3><p>Items Terakira owns (software login, invoice template) show as “Terakira is preparing this” so the client sees progress without acting. Bank feed and payroll access are optional.</p></li>
    <li class="node"><div class="meta">Screen</div><h3>Before we start</h3><p>Sign the engagement letter, pay the deposit, choose WhatsApp, email or phone. A paid deposit shows “Terakira will confirm” until the team matches the payment.</p></li>
    <li class="node end"><div class="meta">Screen</div><h3>Review</h3><p>Lists what’s open with a shortcut back to each one, plus what Terakira does next. If everything is settled, it says so.</p></li>
  </ol>
  <h2>Item statuses</h2>
  <div class="legend"><ul class="rows">
    <li class="row" data-s="todo"><div class="mark"></div><div><div class="title">Needed</div><div class="state" style="color:var(--muted);font-weight:400">The client has to act.</div></div></li>
    <li class="row" data-s="later"><div class="mark"></div><div><div class="title">You’ll send this later</div><div class="state" style="color:var(--muted)">Client promised it. Still counts as open.</div></div></li>
    <li class="row" data-s="done"><div class="mark">✓</div><div><div class="title">Received</div></div></li>
    <li class="row" data-s="team"><div class="mark">…</div><div><div class="title">Terakira is preparing this</div></div></li>
    <li class="row" data-s="review"><div class="mark">…</div><div><div class="title">Terakira will confirm</div></div></li>
    <li class="row" data-s="na"><div class="mark">–</div><div><div class="title">Not needed</div></div></li>
  </ul></div>
  <h2 style="margin-top:32px">Always on</h2>
  <ul class="next-list"><li>Autosave on every change, with the invite link reopening the same place.</li>
  <li>Running total of settled items in the header, shown as a ledger balance with a double rule.</li>
  <li>Suggested: a WhatsApp reminder after three days if items remain open.</li>
  <li>Suggested: a Terakira-side view with the same statuses, so your team sees what each client still owes.</li></ul>
  <p class="lede" style="margin-top:20px">This prototype doesn’t upload files or send messages.</p>
  </main></div>`;
}

/* ---------- render ---------- */
function render(focus){
  const root = document.getElementById('root'), bar = document.getElementById('bar');
  if(S.tab==='flow'){ root.innerHTML = flowView(); bar.hidden = true; chrome(); if(focus) window.scrollTo(0,0); return; }
  const st = STEPS[S.step];
  const rail = st==='welcome' ? '' : '<nav class="rail" id="rail" aria-label="Progress"></nav>';
  const view = st==='docs' ? `<h1 tabindex="-1">Documents</h1><p class="lede">Upload what you have. Anything you can’t find can wait.</p>` + V.docs() : V[st]();
  root.innerHTML = `<div class="shell ${st==='welcome'?'':'has-rail'}">${rail}<main id="main" tabindex="-1">${view}</main></div>`;
  // action bar
  let left='', right='';
  if(st==='welcome') right = `<button class="btn" data-act="next" style="width:100%">Start setup</button>`;
  else{
    left = `<button class="btn quiet" data-act="back">Back</button>`;
    if(st==='tailor'){
      const ok = Object.values(S.ans).every(v=>v!==null);
      right = `<span class="note">${ok?'':'Answer all five to continue.'}</span><button class="btn" data-act="next" ${ok?'':'disabled'}>Continue</button>`;
    } else if(st==='review'){
      right = `<span class="note">Saved. Come back any time.</span>`;
    } else right = `<button class="btn" data-act="next">${st==='start'?'Review':'Continue'}</button>`;
  }
  bar.hidden = false;
  bar.innerHTML = `<div class="bar-in">${st==='welcome'?'':left}${right}</div>`;
  chrome();
  if(focus){ window.scrollTo(0,0); const h = document.querySelector('main h1'); if(h) h.focus({preventScroll:true}); }
}

function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.hidden=false; clearTimeout(toast.t); toast.t=setTimeout(()=>t.hidden=true,2600); }
const setItem = (id, status, note) => { S.items[id] = { status, note: note||'' }; save(); render(); };
const stampDate = () => new Date().toLocaleDateString('en-MY',{day:'numeric',month:'long',year:'numeric'});

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if(!b) return;
  const act = b.dataset.act, id = b.dataset.id;
  switch(act){
    case 'tab': S.tab = b.dataset.v; save(); render(true); break;
    case 'next': S.step = Math.min(S.step+1, STEPS.length-1); save(); render(true); break;
    case 'back': S.step = Math.max(S.step-1, 0); save(); render(true); break;
    case 'go': S.step = +b.dataset.i; save(); render(true); break;
    case 'ans': { const v = b.dataset.v; S.ans[b.dataset.k] = v==='true'?true:v==='false'?false:v; save(); render(); break; }
    case 'later': setItem(id,'later'); break;
    case 'undo': delete S.items[id]; save(); render(); break;
    case 'na': setItem(id,'na'); break;
    case 'apply': setItem(id,'todo'); break;
    case 'tap': setItem(id,'done',ITEMS[id].done); break;
    case 'savetxt': { const v = document.querySelector(`[data-txt="${id}"]`).value.trim(); if(!v){ toast('Enter a contact first.'); break; } setItem(id,'done',v); break; }
    case 'addh': S.co.holders.push({name:'',pct:''}); save(); render(); break;
    case 'delh': S.co.holders.splice(+b.dataset.i,1); save(); render(); break;
    case 'comms': S.comms = b.dataset.v; save(); render(); break;
    case 'sign': { const n = S.sig.trim(); if(n.length<2){ toast('Type your full name to sign.'); break; } setItem('s_letter','done',`Signed by ${n}, ${stampDate()}`); break; }
    case 'paid': setItem('s_dep','review'); break;
    case 'invoice': toast('On the live site, this opens your invoice.'); break;
    case 'demo': loadDemo(); break;
  }
});
document.addEventListener('input', e => {
  const t = e.target;
  if(t.dataset.f){ const k=t.dataset.f.split('.'); S[k[0]][k[1]] = t.value; save(); chrome(); }
  else if(t.dataset.h!==undefined){ S.co.holders[+t.dataset.h][t.dataset.hk] = t.value; save(); const el=document.getElementById('hTotal'); const tot=holdersTotal(); el.textContent=htext(tot); el.className='total '+(Math.round(tot*100)===10000?'ok':'bad'); chrome(); }
  else if(t.dataset.sig!==undefined){ S.sig = t.value; save(); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if(t.dataset.f){ const k=t.dataset.f.split('.'); S[k[0]][k[1]] = t.value; save(); chrome(); if(t.dataset.rerender) render(); }
  if(t.dataset.file && t.files[0]){ setItem(t.dataset.file,'done',t.files[0].name); }
});

function loadDemo(){
  S = blank();
  S.ans = { newCo:true, bank:'none', payroll:false, loans:null, sst:false };
  S.co = { name:'Street Shawarma', entity:'Sole proprietorship', ssm:'202603000000', tin:'', addr:'', contact:'', phone:'', email:'', fye:'', holders:[{name:'',pct:''}] };
  S.items = { d_ssm:{status:'done',note:'ssm-form.pdf'}, s_letter:{status:'done',note:'Signed on 11 September 2026'} };
  S.comms = 'WhatsApp group'; S.step = 5; save(); render(true);
  toast('Example loaded. Some items are still open.');
}

render();