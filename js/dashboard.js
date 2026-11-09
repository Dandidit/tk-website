import { getAppUser, logout } from "./auth-guard.js";
import { apiFetch } from "./api.js";
import { getJWT } from "./auth.js";
import { ITEMS, ID_ORDER, SETTLED, status as itemStatus, stats as itemStats } from "./onboarding-model.js";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const user = await getAppUser();
if (!user) throw new Error("Authentication required");

const state = { onboarding:null, events:[], clients:[], selected:null, statements:[], month:new Date(new Date().getFullYear(),new Date().getMonth(),1), documentFilter:"all", documentClientFilter:"all" };
const isAdmin = user.role === "admin";
const clientId = isAdmin ? new URLSearchParams(location.search).get("client") : null;
const TYPE_LABEL = {bookkeeping:"Bookkeeping",appointment:"Appointment",adhoc:"Ad hoc upload",reminder:"Reminder"};
const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const dayLabel = v => v ? new Date(`${String(v).slice(0,10)}T00:00:00`).toLocaleDateString("en-MY",{day:"numeric",month:"short",year:"numeric"}) : "—";
const eventTitle = e => e.type==="bookkeeping"&&e.period ? `${e.title} – ${new Date(`${e.period}T00:00:00`).toLocaleDateString("en-MY",{month:"short",year:"numeric"})}` : e.title;
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const formatDate = value => { if(!value)return "—"; const d=new Date(value); return Number.isNaN(d.getTime())?"—":d.toLocaleDateString("en-MY",{day:"numeric",month:"short",year:"numeric"}); };
const formatDateTime = value => { if(!value)return "—"; const d=new Date(value); return Number.isNaN(d.getTime())?"—":d.toLocaleString("en-MY",{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"}); };
const money = value => Number.isFinite(Number(value)) ? new Intl.NumberFormat("en-MY",{style:"currency",currency:"MYR"}).format(Number(value)) : "—";
const initials = value => String(value||"TK").trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase();
const setMessage = (el,msg,error=false) => { if(el){el.textContent=msg;el.classList.toggle("error",error);} };

$("#welcome-title").textContent = `Welcome back, ${(user.name||user.email||"there").split(" ")[0]}`;
$("#sidebar-name").textContent = user.name||user.email||"Client";
$("#user-avatar").textContent = initials(user.name||user.email);
$("#today-label").textContent = new Date().toLocaleDateString("en-MY",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
$("#logout-button").addEventListener("click",logout);
if(isAdmin){
  $("#set-event-button").hidden=false;
  $("#upload-form").hidden=true;
  $("#document-client-filter-wrap").hidden=false;
  $("#document-client-heading").hidden=false;
  const link=document.createElement("a");link.href="/admin.html";link.className="text-link";link.textContent="Admin Page";$(".sidebar-user")?.append(link);
  const navLink=document.createElement("a");navLink.href="/admin.html";navLink.className="nav-item admin-nav-link";navLink.textContent="Admin Page";$("#portal-nav")?.append(navLink);
}
$("#mobile-logout")?.addEventListener("click",logout);

function switchView(view){
  $$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  $$(".view").forEach(s=>s.classList.toggle("active",s.id===`view-${view}`));
}
$$(".nav-item").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.view)));

async function loadCoreData(){
  const results = await Promise.allSettled([
    apiFetch("/api/client?action=onboarding"),
    apiFetch(`/api/client?action=events${clientId?`&userId=${encodeURIComponent(clientId)}`:""}`),
    isAdmin?apiFetch("/api/client?action=events&clients=1"):Promise.resolve([]),
    apiFetch("/api/finance?action=statements")
  ]);
  if(results[0].status==="fulfilled")state.onboarding=results[0].value;else console.warn("Onboarding:",results[0].reason);
  if(results[1].status==="fulfilled")state.events=Array.isArray(results[1].value)?results[1].value:[];else console.warn("Events:",results[1].reason);
  if(results[2].status==="fulfilled")state.clients=Array.isArray(results[2].value)?results[2].value:[];
  if(results[3].status==="fulfilled")state.statements=Array.isArray(results[3].value)?results[3].value:[];else console.warn("Statements:",results[3].reason);
  if(clientId){const c=state.clients.find(x=>x.id===clientId);$("#client-banner").hidden=false;$("#client-banner-text").textContent=`Viewing client: ${c?(c.name||c.email):"Unknown client"}`;}
  const company=state.onboarding?.onboarding?.co?.name;if(company)$("#sidebar-company").textContent=company;
  renderCalendar();renderPending();renderChecklist();renderLatestActivity();renderProfile();renderClientFilter();renderDocuments();renderUploadOptions();
}
function calendarItems(){
  const out=[];
  for(const e of state.events){
    if(e.status==="cancelled")continue;
    const date=String(e.event_date).slice(0,10);
    out.push({date,type:e.type,ev:e,label:e.type==="bookkeeping"?`Submit: ${eventTitle(e)}`:e.title,done:!!e.submitted_at});
    if(e.type==="bookkeeping"&&e.return_date)out.push({date:String(e.return_date).slice(0,10),type:"bookkeeping",ev:e,label:"Bookkeeper Report due",report:true});
  }
  return out;
}
function renderCalendar(){
  const d=state.month,y=d.getFullYear(),m=d.getMonth(),first=(new Date(y,m,1).getDay()+6)%7,days=new Date(y,m+1,0).getDate(),todayKey=ymd(new Date());
  $("#calendar-month").textContent=d.toLocaleDateString("en-MY",{month:"long",year:"numeric"});
  const byDay=new Map();for(const it of calendarItems()){if(!byDay.has(it.date))byDay.set(it.date,new Set());byDay.get(it.date).add(it.type);}
  let html=["M","T","W","T","F","S","S"].map(x=>`<div class="weekday">${x}</div>`).join("");
  for(let i=0;i<first;i++)html+='<div class="day"></div>';
  for(let day=1;day<=days;day++){const key=ymd(new Date(y,m,day)),types=byDay.get(key);html+=`<div class="day${key===todayKey?" today":""}${key===state.selected?" selected":""}" data-day="${key}">${day}${types?`<span class="day-dots">${[...types].map(t=>`<i class="t-${t}"></i>`).join("")}</span>`:""}</div>`;}
  $("#calendar-grid").innerHTML=html;
  $$("#calendar-grid [data-day]").forEach(el=>el.addEventListener("click",()=>{state.selected=state.selected===el.dataset.day?null:el.dataset.day;renderCalendar();}));
  renderDayEvents();
}
function renderDayEvents(){
  const box=$("#day-events");
  if(!state.selected){box.innerHTML="";return;}
  const items=calendarItems().filter(i=>i.date===state.selected);
  box.innerHTML=items.length?items.map((i,n)=>`<div class="day-event"><i class="legend-dot t-${i.type}"></i><div><strong>${escapeHtml(i.label)}</strong><small>${escapeHtml(TYPE_LABEL[i.type])}${i.ev.start_time?` · ${escapeHtml(String(i.ev.start_time).slice(0,5))}`:""}${isAdmin&&!clientId?` · ${escapeHtml(i.ev.user_name||i.ev.user_email||"")}`:""}${i.done?" · Submitted":""}${i.ev.notes?` · ${escapeHtml(i.ev.notes)}`:""}</small></div>${isAdmin&&!i.report?`<button type="button" data-edit="${escapeHtml(i.ev.id)}">Edit</button>`:""}</div>`).join(""):`<p class="muted">Nothing on ${escapeHtml(dayLabel(state.selected))}.</p>`;
  box.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>openEventModal(state.events.find(e=>e.id===b.dataset.edit))));
}
$("#calendar-prev").addEventListener("click",()=>{state.month.setMonth(state.month.getMonth()-1);renderCalendar();});
$("#calendar-next").addEventListener("click",()=>{state.month.setMonth(state.month.getMonth()+1);renderCalendar();});

function getOnboardingState(){
  const o=state.onboarding?.onboarding;if(!o)return null;
  return {ans:o.ans||{},co:{holders:[{name:"",pct:""}],...(o.co||{})},items:o.items||{},comms:o.comms||"",sig:o.sig||""};
}
function getOnboardingTasks(){
  const S=getOnboardingState();if(!S)return [];
  return ID_ORDER.filter(id=>!SETTLED.includes(itemStatus(S,id))).map(id=>({title:ITEMS[id].label,detail:S.items[id]?.note||"Onboarding item requires attention",warning:false}));
}
function renderPending(){
  const todayKey=ymd(new Date()),upcoming=calendarItems().filter(i=>i.date>=todayKey&&!i.done&&!i.report).sort((a,b)=>a.date.localeCompare(b.date)).filter((i,n,all)=>all.findIndex(x=>(x.ev.series_id||x.ev.id)===(i.ev.series_id||i.ev.id))===n).slice(0,3).map(i=>({title:i.label,detail:`${TYPE_LABEL[i.type]} · ${dayLabel(i.date)}`,tag:i.type==="reminder"?"Reminder":"Coming"}));
  const pending=getOnboardingTasks().slice(0,3).map(t=>({...t,tag:t.warning?"Review":"Pending"}));
  const entries=[...pending,...upcoming].slice(0,5);$("#pending-count").textContent=entries.length;
  $("#pending-list").innerHTML=entries.length?entries.map(x=>`<div class="activity-item"><span class="activity-tag${x.warning?" warning":""}">${escapeHtml(x.tag)}</span><div class="activity-copy"><strong>${escapeHtml(x.title)}</strong><small>${escapeHtml(x.detail)}</small></div></div>`).join(""):'<p class="muted">You’re all caught up. No pending tasks or upcoming appointments.</p>';
}
function renderChecklist(){
  const S=getOnboardingState(),{done,total}=S?itemStats(S):{done:0,total:ID_ORDER.length};
  $("#checklist-count").textContent=S?`${done} / ${total}`:"Not started";
  $("#checklist-summary").innerHTML=S?`<div class="checkline ${done===total?"done":""}">${done} of ${total} checklist items settled</div><div class="checkline ${state.onboarding?.completed?"done":""}">${state.onboarding?.completed?"Onboarding completed":"Onboarding in progress"}</div>`:'<p class="muted">Your onboarding checklist has not been started.</p>';
}
function renderLatestActivity(){
  const latest=[...state.statements].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0];
  const next=calendarItems().filter(i=>i.type==="appointment"&&i.date>=ymd(new Date())).sort((a,b)=>a.date.localeCompare(b.date))[0];
  const rows=[];if(latest)rows.push({title:latest.original_filename,detail:`Bank statement uploaded ${formatDate(latest.created_at)}`});if(next)rows.push({title:next.label,detail:`Next appointment · ${dayLabel(next.date)}${next.ev.start_time?` ${String(next.ev.start_time).slice(0,5)}`:""}`});
  $("#latest-activity").innerHTML=rows.length?rows.map(x=>`<div class="activity-item"><div class="activity-copy"><strong>${escapeHtml(x.title)}</strong><small>${escapeHtml(x.detail)}</small></div></div>`).join(""):'<p class="muted">Your latest updates will appear here.</p>';
}
function renderProfile(){
  const co=state.onboarding?.onboarding?.co||{},fields=[["Full name",user.name],["Email",user.email],["Phone",co.phone],["Company name",co.name],["Entity type",co.entity],["SSM registration no.",co.ssm],["Tax ID (TIN)",co.tin],["Registered address",co.addr],["Contact person",co.contact],["Business email",co.email],["Financial year end",co.fye]];
  $("#profile-details").innerHTML=fields.map(([k,v])=>`<div class="profile-field"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v||"Not provided")}</strong></div>`).join("");
}
function flattenReport(report){
  if(Array.isArray(report))return report;const out=[];
  const walk=rows=>{for(const row of rows||[]){if(row.RowType==="Row"&&Array.isArray(row.Cells))out.push(row.Cells.map(c=>c?.Value??""));if(Array.isArray(row.Rows))walk(row.Rows);}};
  walk(report?.Rows||[]);return out;
}
function numeric(value){
  if(value==null||value==="")return null;
  let text=String(value).replace(/[,\sRM$]/g,"");if(text.startsWith("(")&&text.endsWith(")"))text="-"+text.slice(1,-1);
  const n=Number(text);return Number.isFinite(n)?n:null;
}
function cashFromRows(rows){
  const total=rows.find(r=>/^total$/i.test(String(r[0]||"").trim()));
  if(total)return numeric(total.at(-1));
  const accountRows=rows.filter(r=>r.length>=3&&String(r[0]||"").trim()&&!/^(bank account|account|closing balance)$/i.test(String(r[0]).trim()));
  const amounts=accountRows.map(r=>numeric(r.at(-1))).filter(v=>v!==null);
  return amounts.length?amounts.reduce((a,b)=>a+b,0):null;
}
function renderProfit(data){
  // Server now sends real calendar months (1st -> end of month), already in
  // chronological (oldest -> newest) order, each with a precomputed Net
  // Profit figure — no more reconstructing this from Xero's raw report rows.
  const months=(data.profitAndLossMonths||[]).filter(m=>m.netProfit!==null).slice(-6);
  const values=months.map(m=>m.netProfit),labels=months.map(m=>m.label);
  if(!values.length){$("#profit-chart").innerHTML='<div class="chart-empty">Profit &amp; Loss data is not available from Xero yet.</div>';return;}
  // base/maxHalf sized so the deepest negative bar + its value label never
  // collides with the fixed month-label row underneath (previous geometry let
  // a near-max negative bar extend past the month labels and get clipped/
  // overlapped, making the value unreadable).
  const max=Math.max(...values.map(Math.abs),1),w=560,base=90,maxHalf=50,bw=42,gap=42,start=(w-(values.length*bw+(values.length-1)*gap))/2;
  const monthY=base+maxHalf+32,viewH=monthY+14;
  let svg=`<svg viewBox="0 0 ${w} ${viewH}" role="img" aria-label="Monthly net profit and loss"><line x1="18" x2="${w-18}" y1="${base}" y2="${base}" stroke="var(--portal-line)"/>`;
  values.forEach((v,i)=>{
    const h=Math.max(3,Math.abs(v)/max*maxHalf),x=start+i*(bw+gap),y=v>=0?base-h:base,color=v>=0?"var(--portal-positive)":"var(--portal-negative)";
    const valueY=v>=0?y-8:y+h+15;
    svg+=`<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="5" fill="${color}"/>`;
    svg+=`<text x="${x+bw/2}" y="${valueY}" text-anchor="middle" fill="${color}" font-size="10" font-weight="600">${escapeHtml(money(v))}</text>`;
    svg+=`<text x="${x+bw/2}" y="${monthY}" text-anchor="middle" fill="var(--portal-muted)" font-size="11">${escapeHtml(labels[i]||String(i+1))}</text>`;
  });
  $("#profit-chart").innerHTML=svg+"</svg><p class='muted'>Monthly net profit/loss · Values supplied by Xero.</p>";
}
function setXeroState(text,error=false){const el=$("#xero-state");el.innerHTML=`<i></i>${escapeHtml(text)}`;el.classList.toggle("error",error);}
async function loadXero(){
  if(user.role==="admin"){
    setXeroState("Admin account",true);$("#cash-caption").textContent="Open a client account to view its financial data.";$("#invoice-caption").textContent="This admin account has no client organisation mapping.";$("#profit-chart").innerHTML='<div class="chart-empty">Open a client account to view its Xero financial data.</div>';$("#profile-xero-name").textContent="Managed by TeraKira";$("#profile-xero-caption").textContent="Organisation connections are managed in the admin portal.";return;
  }
  try{
    const data=await apiFetch("/api/xero?action=dashboard");setXeroState("Synced from Xero");
    const bankRows=data.bankSummaryRows?.length?data.bankSummaryRows:flattenReport(data.bankSummary),cash=cashFromRows(bankRows);
    $("#cash-balance").textContent=cash===null?"—":money(cash);$("#cash-caption").textContent=cash===null?"Balance not available in Xero report":`Xero · ${data.organisation||"Connected organisation"}`;
    $("#invoice-total").textContent=money(data.outstandingInvoices?.total);$("#invoice-caption").textContent=`${Number(data.outstandingInvoices?.count||0)} invoices · ${Number(data.outstandingInvoices?.overdueCount||0)} overdue`;
    $("#profile-xero-name").textContent=data.organisation||"Xero connected";$("#profile-xero-caption").textContent=`Last retrieved ${formatDateTime(data.syncedAt)}`;renderProfit(data);
  }catch(error){
    setXeroState("Xero unavailable",true);$("#cash-balance").textContent="—";$("#invoice-total").textContent="—";$("#invoice-caption").textContent=error.message||"Unable to retrieve Xero data.";$("#cash-caption").textContent="Xero data could not be loaded.";$("#profile-xero-name").textContent="Not connected";$("#profile-xero-caption").textContent=error.message||"No Xero organisation is assigned.";$("#profile-xero-indicator").classList.add("error");$("#profit-chart").innerHTML=`<div class="chart-empty">${escapeHtml(error.message||"Xero financial data is unavailable.")}</div>`;
  }
}
function statementClientKey(statement){
  return String(statement.user_id ?? statement.user_email ?? "unknown");
}
function renderClientFilter(){
  if(!isAdmin)return;
  const select=$("#document-client-filter");
  const clients=new Map();
  for(const statement of state.statements){
    const key=statementClientKey(statement);
    if(key==="unknown")continue;
    if(!clients.has(key))clients.set(key,{name:statement.user_name||statement.user_email||"Unnamed client",email:statement.user_email||""});
  }
  const selected=state.documentClientFilter;
  select.innerHTML='<option value="all">All clients</option>'+[...clients.entries()]
    .sort((a,b)=>a[1].name.localeCompare(b[1].name))
    .map(([key,client])=>`<option value="${escapeHtml(key)}">${escapeHtml(client.name)}${client.email&&client.email!==client.name?` · ${escapeHtml(client.email)}`:""}</option>`).join("");
  select.value=clients.has(selected)?selected:"all";
  state.documentClientFilter=select.value;
}
function renderDocuments(){
  let docs=state.statements.filter(()=>state.documentFilter==="all"||state.documentFilter==="Uploads");
  if(isAdmin&&state.documentClientFilter!=="all")docs=docs.filter(d=>statementClientKey(d)===state.documentClientFilter);
  const body=$("#document-rows");
  if(!docs.length){
    const message=state.documentFilter==="Reports"||state.documentFilter==="Tax"?"No documents in this category yet.":"No uploaded bank statements found for this selection.";
    body.innerHTML=`<tr><td colspan="${isAdmin?6:5}" class="empty-cell">${message}</td></tr>`;return;
  }
  body.innerHTML=docs.map(d=>{
    const raw=String(d.parse_status||"pending").toLowerCase();
    const done=["completed","complete","success","parsed","succeeded"].includes(raw);
    const failed=["failed","error"].includes(raw);
    const cls=done?"":failed?"error":"warning";
    const label=done?"Processed":failed?"Failed":raw.replaceAll("_"," ");
    const clientCell=isAdmin?`<td><strong>${escapeHtml(d.user_name||"Unnamed client")}</strong>${d.user_email?`<small class="document-client-email">${escapeHtml(d.user_email)}</small>`:""}</td>`:"";
    return `<tr><td>${escapeHtml(d.original_filename||"Untitled document")}</td><td>${escapeHtml(d.event_title?eventTitle({type:"bookkeeping",title:d.event_title,period:d.event_period}):"Uploads")}</td><td>${escapeHtml(formatDate(d.created_at))}</td><td><span class="document-status ${cls}">${escapeHtml(label)}</span></td>${clientCell}<td><button class="file-action" type="button" data-open-statement="${escapeHtml(d.id)}">Open</button></td></tr>`;
  }).join("");
  body.querySelectorAll("[data-open-statement]").forEach(b=>b.addEventListener("click",()=>openStatement(b.dataset.openStatement,b)));
}
$$("[data-filter]").forEach(b=>b.addEventListener("click",()=>{state.documentFilter=b.dataset.filter; $$("[data-filter]").forEach(x=>x.classList.toggle("active",x===b));renderDocuments();}));
$("#document-client-filter")?.addEventListener("change",event=>{state.documentClientFilter=event.target.value;renderDocuments();});
async function openStatement(id,button){
  const original=button.textContent;button.disabled=true;button.textContent="Opening…";
  try{const token=await getJWT();if(!token)throw new Error("Your session has expired. Please sign in again.");const response=await fetch(`/api/client?action=onboarding-file&id=${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||"Unable to open this document.");}const url=URL.createObjectURL(await response.blob());const win=window.open(url,"_blank","noopener,noreferrer");if(!win)throw new Error("Pop-up blocked. Please allow pop-ups and try again.");setTimeout(()=>URL.revokeObjectURL(url),60000);}
  catch(e){alert(e.message);}finally{button.disabled=false;button.textContent=original;}
}
$("#statement-file").addEventListener("change",async()=>{
  const file=$("#statement-file").files?.[0];if(!file)return;const msg=$("#upload-message"),eventId=$("#upload-event").value,allowed=["application/pdf","image/jpeg","image/png"];
  if(!eventId){setMessage(msg,"Select what this upload is for first.",true);$("#statement-file").value="";return;}
  if(!allowed.includes(file.type)){setMessage(msg,"Only PDF, JPG and PNG files are allowed.",true);$("#statement-file").value="";return;}
  setMessage(msg,"Uploading…");
  try{
    const {upload}=await import("https://cdn.jsdelivr.net/npm/@vercel/blob@2.8.0/client/+esm"),token=await getJWT();if(!token)throw new Error("Your session has expired. Please sign in again.");
    const blob=await upload(`bank-statements/${user.id}/${Date.now()}-${file.name}`,file,{access:"private",handleUploadUrl:`${location.origin}/api/upload`,headers:{Authorization:`Bearer ${token}`}});
    const statement=await apiFetch("/api/finance?action=statements",{method:"POST",body:JSON.stringify({originalFilename:file.name,storageUrl:blob.url,storagePath:blob.pathname,fileSize:file.size,eventId})});
    setMessage(msg,"Upload complete. Processing statement…");await apiFetch("/api/finance?action=transactions",{method:"POST",body:JSON.stringify({statementId:statement.id})});setMessage(msg,"Document uploaded and sent for processing.");await loadCoreData();
  }catch(error){console.error(error);setMessage(msg,error.message||"Upload failed.",true);}finally{$("#statement-file").value="";}
});

function renderUploadOptions(){
  const sel=$("#upload-event");if(!sel||isAdmin)return;
  const open=state.events.filter(e=>["bookkeeping","adhoc"].includes(e.type)&&!e.submitted_at&&e.status!=="cancelled").sort((a,b)=>String(a.event_date).localeCompare(String(b.event_date))).filter((e,n,all)=>all.findIndex(x=>(x.series_id||x.id)===(e.series_id||e.id))===n);
  sel.innerHTML=open.length?'<option value="">Select what you are uploading for…</option>'+open.map(e=>`<option value="${escapeHtml(e.id)}">${escapeHtml(eventTitle(e))} (due ${escapeHtml(dayLabel(e.event_date))})</option>`).join(""):'<option value="">No uploads requested yet</option>';
  $("#upload-form").classList.toggle("disabled",!open.length);
}

// ---- Set event modal (admin) ----
const ev$ = id => document.getElementById(`event-${id}`);
const modal = $("#event-modal");
let editing = null;
function syncEventForm(){
  const type=ev$("type").value,bk=type==="bookkeeping",ap=type==="appointment";
  ev$("title-wrap").hidden=bk;ev$("title").required=!bk;
  ev$("period-wrap").hidden=!bk;ev$("time-wrap").hidden=!ap;ev$("time").required=ap;
  ev$("date-label").textContent=bk?"Submit by":ap?"Date":type==="adhoc"?"Upload by":"Date";
  const ret=ev$("return");ret.hidden=!bk;
  if(bk){const base=ev$("date").value;if(base){const d=new Date(`${base}T00:00:00`);d.setDate(d.getDate()+15);ret.textContent=`Bookkeeper Report due ${dayLabel(ymd(d))} (15 days after documents are submitted).`;}else ret.textContent="Bookkeeper Report is due 15 days after documents are submitted.";}
  ev$("repeat-opts").hidden=!ev$("repeat-on").checked;
}
function openEventModal(event){
  editing=event||null;
  ev$("heading").textContent=editing?"Edit event":"Set event";
  ev$("message").textContent="";ev$("message").classList.remove("error");
  $("#event-form").reset();
  const pickClient=!clientId&&!editing;
  ev$("client-wrap").hidden=!pickClient;ev$("client").required=pickClient;
  ev$("client-fixed").hidden=pickClient;
  if(pickClient)ev$("client").innerHTML='<option value="">Select client…</option>'+state.clients.map(c=>`<option value="${escapeHtml(c.id)}">${escapeHtml(c.name||c.email)}${c.name&&c.email?` · ${escapeHtml(c.email)}`:""}</option>`).join("");
  else{const c=state.clients.find(x=>x.id===(editing?.user_id||clientId));ev$("client-fixed").textContent=`Client: ${c?(c.name||c.email):(editing?.user_name||"Unknown")}`;}
  ev$("type").disabled=!!editing;
  ev$("repeat-wrap").hidden=!!editing;
  ev$("delete").hidden=!editing;
  const series=!!editing?.series_id;
  ev$("scope-wrap").hidden=!series;
  if(editing){
    ev$("type").value=editing.type;ev$("title").value=editing.type==="bookkeeping"?"":editing.title;
    ev$("period").value=editing.period?String(editing.period).slice(0,7):"";
    ev$("date").value=String(editing.event_date).slice(0,10);
    ev$("time").value=editing.start_time?String(editing.start_time).slice(0,5):"";
    if(editing.duration_min)ev$("duration").value=String(editing.duration_min);
    ev$("notes").value=editing.notes||"";
  }else{
    ev$("type").value="bookkeeping";
    ev$("date").value=state.selected||ymd(new Date());
    ev$("time").value="10:00";
  }
  if(!editing||!ev$("period").value)ev$("period").value=ev$("date").value.slice(0,7);
  syncEventForm();
  modal.hidden=false;
}
function closeEventModal(){modal.hidden=true;editing=null;}
async function eventRequest(url,options){
  const save=ev$("save");save.disabled=true;
  try{const r=await apiFetch(url,options);closeEventModal();await loadCoreData();return r;}
  catch(error){setMessage(ev$("message"),error.message||"Could not save the event.",true);}
  finally{save.disabled=false;}
}
$("#set-event-button")?.addEventListener("click",()=>openEventModal(null));
$$(".event-close").forEach(b=>b.addEventListener("click",closeEventModal));
modal.addEventListener("click",e=>{if(e.target===modal)closeEventModal();});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!modal.hidden)closeEventModal();});
["type","date","repeat-on"].forEach(id=>ev$(id).addEventListener("change",()=>{
  if(id==="date"&&ev$("period").value.slice(0,7)!==ev$("date").value.slice(0,7)&&!editing)ev$("period").value=ev$("date").value.slice(0,7);
  syncEventForm();
}));
$("#event-form").addEventListener("submit",async e=>{
  e.preventDefault();
  const body={type:ev$("type").value,title:ev$("title").value.trim(),eventDate:ev$("date").value,startTime:ev$("time").value,duration:ev$("duration").value,period:ev$("period").value,notes:ev$("notes").value.trim()};
  if(editing){
    const scope=ev$("scope-wrap").hidden?"one":ev$("scope").value;
    return eventRequest("/api/client?action=events",{method:"PATCH",body:JSON.stringify({...body,id:editing.id,scope})});
  }
  if(ev$("repeat-on").checked){body.repeat=ev$("repeat").value;body.repeatUntil=ev$("until").value||null;}
  body.userId=clientId||ev$("client").value;
  return eventRequest("/api/client?action=events",{method:"POST",body:JSON.stringify(body)});
});
ev$("delete").addEventListener("click",async()=>{
  if(!editing||!confirm("Delete this event?"))return;
  const scope=ev$("scope-wrap").hidden?"one":ev$("scope").value;
  await eventRequest(`/api/client?action=events&id=${encodeURIComponent(editing.id)}&scope=${scope}`,{method:"DELETE"});
});

await loadCoreData();
await loadXero();
