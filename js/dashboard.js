import { getAppUser, logout } from "./auth-guard.js";
import { apiFetch } from "./api.js";
import { getJWT } from "./auth.js";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const user = await getAppUser();
if (!user) throw new Error("Authentication required");

const state = { onboarding:null, appointments:[], statements:[], month:new Date(new Date().getFullYear(),new Date().getMonth(),1), documentFilter:"all", documentClientFilter:"all" };
const isAdmin = user.role === "admin";
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
  $("#admin-appointment-panel").hidden=false;
  $("#document-client-filter-wrap").hidden=false;
  $("#document-client-heading").hidden=false;
  const link=document.createElement("a");link.href="/admin.html";link.className="text-link";link.textContent="Admin view";$(".sidebar-user")?.append(link);
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
    apiFetch("/api/client?action=appointments"),
    apiFetch("/api/finance?action=statements")
  ]);
  if(results[0].status==="fulfilled")state.onboarding=results[0].value;else console.warn("Onboarding:",results[0].reason);
  if(results[1].status==="fulfilled")state.appointments=Array.isArray(results[1].value)?results[1].value:[];else console.warn("Appointments:",results[1].reason);
  if(results[2].status==="fulfilled")state.statements=Array.isArray(results[2].value)?results[2].value:[];else console.warn("Statements:",results[2].reason);
  const company=state.onboarding?.onboarding?.co?.name;if(company)$("#sidebar-company").textContent=company;
  renderCalendar();renderPending();renderChecklist();renderLatestActivity();renderProfile();renderClientFilter();renderDocuments();
}
function activeAppointments(){return state.appointments.filter(a=>a.status!=="cancelled");}
function renderCalendar(){
  const d=state.month,y=d.getFullYear(),m=d.getMonth(),first=(new Date(y,m,1).getDay()+6)%7,days=new Date(y,m+1,0).getDate(),today=new Date();
  $("#calendar-month").textContent=d.toLocaleDateString("en-MY",{month:"long",year:"numeric"});
  const marks=new Set(activeAppointments().map(a=>{const x=new Date(a.start_at);return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;}));
  let html=["M","T","W","T","F","S","S"].map(x=>`<div class="weekday">${x}</div>`).join("");
  for(let i=0;i<first;i++)html+='<div class="day"></div>';
  for(let day=1;day<=days;day++){const isToday=y===today.getFullYear()&&m===today.getMonth()&&day===today.getDate(),has=marks.has(`${y}-${m}-${day}`);html+=`<div class="day${isToday?" today":""}${has?" has-event":""}">${day}</div>`;}
  $("#calendar-grid").innerHTML=html;
}
$("#calendar-prev").addEventListener("click",()=>{state.month.setMonth(state.month.getMonth()-1);renderCalendar();});
$("#calendar-next").addEventListener("click",()=>{state.month.setMonth(state.month.getMonth()+1);renderCalendar();});

function getOnboardingTasks(){
  const items=state.onboarding?.onboarding?.items||{};
  const labels={c_name:"Confirm company details",c_ssm:"Provide SSM information",c_tin:"Provide tax identification number",c_addr:"Confirm registered address",c_fye:"Confirm financial year end",c_hold:"Confirm company ownership",d_ssm:"Upload SSM documents",d_tax:"Upload tax documents",d_fs:"Upload financial statements",d_bank:"Upload bank statements",d_pay:"Provide payroll information",d_loan:"Provide loan information",d_asset:"Provide asset information",d_sst:"Provide SST documents",a_bank:"Provide bank access",s_letter:"Complete engagement letter",s_dep:"Confirm deposit",s_comms:"Set communication preference"};
  return Object.entries(items).filter(([,v])=>!["done","na","team"].includes(String(v?.status||"").toLowerCase())).map(([id,v])=>({title:labels[id]||id.replaceAll("_"," "),detail:v?.note||"Onboarding item requires attention",warning:String(v?.status||"").toLowerCase()==="review"}));
}
function renderPending(){
  const now=Date.now(),upcoming=activeAppointments().filter(a=>new Date(a.start_at).getTime()>=now).sort((a,b)=>new Date(a.start_at)-new Date(b.start_at)).slice(0,3).map(a=>({title:a.title,detail:formatDateTime(a.start_at),tag:"Coming"}));
  const pending=getOnboardingTasks().slice(0,3).map(t=>({...t,tag:t.warning?"Review":"Pending"}));
  const entries=[...pending,...upcoming].slice(0,5);$("#pending-count").textContent=entries.length;
  $("#pending-list").innerHTML=entries.length?entries.map(x=>`<div class="activity-item"><span class="activity-tag${x.warning?" warning":""}">${escapeHtml(x.tag)}</span><div class="activity-copy"><strong>${escapeHtml(x.title)}</strong><small>${escapeHtml(x.detail)}</small></div></div>`).join(""):'<p class="muted">You’re all caught up. No pending tasks or upcoming appointments.</p>';
}
function renderChecklist(){
  const items=Object.values(state.onboarding?.onboarding?.items||{}),done=items.filter(x=>["done","na","team"].includes(String(x?.status||"").toLowerCase())).length;
  $("#checklist-count").textContent=items.length?`${done} / ${items.length}`:"Not started";
  $("#checklist-summary").innerHTML=items.length?`<div class="checkline ${done===items.length?"done":""}">${done} of ${items.length} recorded items completed</div><div class="checkline ${state.onboarding?.completed?"done":""}">${state.onboarding?.completed?"Onboarding completed":"Onboarding in progress"}</div>`:'<p class="muted">Your onboarding checklist has not been started.</p>';
}
function renderLatestActivity(){
  const latest=[...state.statements].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0];
  const next=activeAppointments().filter(a=>new Date(a.start_at)>=new Date()).sort((a,b)=>new Date(a.start_at)-new Date(b.start_at))[0];
  const rows=[];if(latest)rows.push({title:latest.original_filename,detail:`Bank statement uploaded ${formatDate(latest.created_at)}`});if(next)rows.push({title:next.title,detail:`Next appointment · ${formatDateTime(next.start_at)}`});
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
  const rows=data.profitAndLossRows?.length?data.profitAndLossRows:flattenReport(data.profitAndLoss);
  const row=rows.find(r=>/net profit|net income/i.test(String(r[0]||"")));
  const values=row?row.slice(1).map(numeric).filter(v=>v!==null).slice(-6):[];
  if(!values.length){$("#profit-chart").innerHTML='<div class="chart-empty">Profit &amp; Loss data is not available from Xero yet.</div>';return;}
  const max=Math.max(...values.map(Math.abs),1),w=560,base=128,bw=42,gap=42,start=(w-(values.length*bw+(values.length-1)*gap))/2;
  let svg=`<svg viewBox="0 0 ${w} 190" role="img" aria-label="Monthly net profit and loss"><line x1="18" x2="${w-18}" y1="${base}" y2="${base}" stroke="var(--portal-line)"/>`;
  values.forEach((v,i)=>{const h=Math.max(3,Math.abs(v)/max*82),x=start+i*(bw+gap),y=v>=0?base-h:base,color=v>=0?"var(--portal-positive)":"var(--portal-negative)";svg+=`<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="5" fill="${color}"/><text x="${x+bw/2}" y="165" text-anchor="middle" fill="var(--portal-muted)" font-size="11">${i+1}</text>`;});
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
    return `<tr><td>${escapeHtml(d.original_filename||"Untitled document")}</td><td>Uploads</td><td>${escapeHtml(formatDate(d.created_at))}</td><td><span class="document-status ${cls}">${escapeHtml(label)}</span></td>${clientCell}<td><button class="file-action" type="button" data-open-statement="${escapeHtml(d.id)}">Open</button></td></tr>`;
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
  const file=$("#statement-file").files?.[0];if(!file)return;const msg=$("#upload-message"),allowed=["application/pdf","image/jpeg","image/png"];
  if(!allowed.includes(file.type)){setMessage(msg,"Only PDF, JPG and PNG files are allowed.",true);$("#statement-file").value="";return;}
  setMessage(msg,"Uploading…");
  try{
    const {upload}=await import("https://cdn.jsdelivr.net/npm/@vercel/blob@2.8.0/client/+esm"),token=await getJWT();if(!token)throw new Error("Your session has expired. Please sign in again.");
    const blob=await upload(`bank-statements/${user.id}/${Date.now()}-${file.name}`,file,{access:"private",handleUploadUrl:`${location.origin}/api/upload`,headers:{Authorization:`Bearer ${token}`}});
    const statement=await apiFetch("/api/finance?action=statements",{method:"POST",body:JSON.stringify({originalFilename:file.name,storageUrl:blob.url,storagePath:blob.pathname,fileSize:file.size})});
    setMessage(msg,"Upload complete. Processing statement…");await apiFetch("/api/finance?action=transactions",{method:"POST",body:JSON.stringify({statementId:statement.id})});setMessage(msg,"Statement uploaded and sent for processing.");await loadCoreData();
  }catch(error){console.error(error);setMessage(msg,error.message||"Upload failed.",true);}finally{$("#statement-file").value="";}
});
$("#appointment-form")?.addEventListener("submit",async event=>{
  event.preventDefault();const msg=$("#appointment-message");
  try{await apiFetch("/api/client?action=appointments",{method:"POST",body:JSON.stringify({userId:$("#appointment-user").value.trim(),title:$("#appointment-title").value.trim(),startAt:$("#appointment-start").value,endAt:$("#appointment-end").value,notes:$("#appointment-notes").value.trim()})});event.target.reset();setMessage(msg,"Appointment created.");await loadCoreData();}
  catch(error){setMessage(msg,error.message||"Unable to create appointment.",true);}
});

await loadCoreData();
await loadXero();
