import { getAppUser, logout } from "./auth-guard.js";
import { getJWT } from "./auth.js";
import { apiFetch } from "./api.js";

const currentUser = await getAppUser();
if (!currentUser) throw new Error("Authentication required");

document.getElementById("logout-button").addEventListener("click", logout);
const message = document.getElementById("profile-message");
const content = document.getElementById("profile-content");
const params = new URLSearchParams(location.search);
const requestedUserId = params.get("userId");
const userId = requestedUserId || currentUser.id;

const backLink = document.querySelector(".back-link");
if (backLink) {
  if (currentUser.role === "admin") {
    backLink.href = "/admin.html";
    backLink.textContent = "← Back to admin";
  } else {
    backLink.href = "/dashboard.html";
    backLink.textContent = "← Back to dashboard";
  }
}
const eyebrow = document.querySelector(".profile-header .eyebrow");
if (eyebrow) eyebrow.textContent = currentUser.role === "admin" ? "CLIENT PROFILE" : "MY PROFILE";

const ITEM_LABELS = {
  c_name: "Company name and entity type", c_ssm: "SSM registration number", c_tin: "Income tax number (LHDN TIN)",
  c_addr: "Registered address and contact", c_fye: "Financial year end", c_hold: "Directors and shareholders",
  d_ssm: "SSM incorporation documents", d_tax: "Last year's tax return", d_fs: "Last year's financial statements",
  d_bank: "Bank statements", d_pay: "Payroll records", d_loan: "Hire purchase and loan agreements",
  d_asset: "List of business assets", d_sst: "SST registration details", a_soft: "Accounting software login",
  a_inv: "Invoice template", a_bank: "Read-only bank feed", a_pay: "Payroll system access",
  a_prior: "Company secretary or previous accountant", s_letter: "Signed engagement letter",
  s_dep: "Initial payment", s_comms: "How we keep in touch"
};
const STATUS_LABELS = { todo: "Needed", later: "Send later", done: "Received", na: "Not needed", team: "Terakira is preparing this", review: "Needs review" };
const ANSWER_LABELS = { new_business: "New business", bank_age: "Bank account history", payroll: "Has payroll", loans: "Has loans", sst: "Registered for SST" };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);
}
function value(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
function date(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}
function detailsGrid(id, entries) {
  document.getElementById(id).innerHTML = entries.map(([label, val]) => `<div class="detail"><span class="field-label">${escapeHtml(label)}</span><strong>${escapeHtml(value(val))}</strong></div>`).join("");
}

async function openFile(itemId, button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Opening…";
  try {
    const token = await getJWT();
    if (!token) throw new Error("Your session has expired. Please sign in again.");
    const response = await fetch(`/api/onboarding-file?userId=${encodeURIComponent(userId)}&itemId=${encodeURIComponent(itemId)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || "Unable to open this file.");
    }
    const url = URL.createObjectURL(await response.blob());
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) message.textContent = "Pop-up blocked. Allow pop-ups and try again.";
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    message.textContent = error.message || "Unable to open this file.";
    message.classList.add("error");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function loadProfile() {
  if (!userId) throw new Error("Missing client ID in the URL.");
  const data = await apiFetch(`/api/admin-profile?userId=${encodeURIComponent(userId)}`);
  const user = data.user;
  const co = data.onboarding || {};
  document.getElementById("client-name").textContent = user.name || "Unnamed client";
  document.getElementById("client-email").textContent = user.email || "No email available";
  const complete = !!co.completed_at;
  const badge = document.getElementById("completion-badge");
  badge.textContent = complete ? "Completed" : "In progress";
  badge.classList.toggle("done", complete);
  document.getElementById("updated-at").textContent = date(co.updated_at);
  document.getElementById("current-step").textContent = co.current_step == null ? "—" : `${Number(co.current_step) + 1} of 6`;
  document.getElementById("skipped").textContent = co.skipped ? "Yes" : "No";

  detailsGrid("company-grid", [
    ["Company name", co.company_name], ["Entity type", co.entity_type], ["SSM number", co.ssm_number],
    ["TIN", co.tin], ["Registered address", co.registered_address], ["Contact person", co.contact_name],
    ["Phone", co.phone], ["Business email", co.email], ["Financial year end", co.financial_year_end]
  ]);
  detailsGrid("answers-grid", Object.entries(ANSWER_LABELS).map(([key, label]) => [label, co[key]]));
  detailsGrid("start-grid", [["Communication preference", co.communication_preference], ["Signature name", co.signature_name], ["Signed at", date(co.signed_at)], ["Deposit status", co.deposit_status]]);

  const owners = document.getElementById("owners-list");
  owners.innerHTML = data.owners.length ? data.owners.map(owner => `<div class="item-row"><div><div class="item-title">${escapeHtml(owner.name || "Unnamed owner")}</div></div><span class="item-status">${escapeHtml(value(owner.ownership_pct))}% ownership</span></div>`).join("") : `<p class="empty">No directors or shareholders recorded.</p>`;

  const items = document.getElementById("items-list");
  document.getElementById("item-count").textContent = `${data.items.length} item${data.items.length === 1 ? "" : "s"}`;
  items.innerHTML = data.items.length ? data.items.map(item => {
    const status = String(item.status || "todo").toLowerCase();
    return `<article class="item-row"><div><div class="item-title">${escapeHtml(ITEM_LABELS[item.item_id] || item.item_id)}</div><div class="item-meta">${escapeHtml(item.note || "")}${item.file_name ? `${item.note ? "\n" : ""}File: ${escapeHtml(item.file_name)}` : ""}${item.updated_at ? `${item.note || item.file_name ? "\n" : ""}Updated: ${escapeHtml(date(item.updated_at))}` : ""}</div></div><div><span class="item-status ${status === "done" ? "done" : ""}">${escapeHtml(STATUS_LABELS[status] || status.replaceAll("_", " "))}</span>${item.has_file ? `<p><button class="file-button" data-item-id="${escapeHtml(item.item_id)}" type="button">View file</button></p>` : ""}</div></article>`;
  }).join("") : `<p class="empty">No onboarding items recorded.</p>`;
  items.querySelectorAll("[data-item-id]").forEach(button => button.addEventListener("click", () => openFile(button.dataset.itemId, button)));
  content.hidden = false;
}

try {
  await loadProfile();
} catch (error) {
  message.textContent = error.message || "Unable to load client profile.";
  message.classList.add("error");
  document.getElementById("client-name").textContent = "Client profile";
}
