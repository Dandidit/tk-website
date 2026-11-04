import { getAppUser, logout } from "./auth-guard.js";
import { getJWT } from "./auth.js";
import { apiFetch } from "./api.js";

const user = await getAppUser();
if (!user) throw new Error("Authentication required");
if (user.role !== "admin") {
  document.body.innerHTML = `
    <main style="max-width:560px;margin:12vh auto;padding:24px;font:16px system-ui;color:#e5f0ea">
      <h1>Access denied</h1><p>This page is available to administrator accounts only.</p>
      <a href="/dashboard.html" style="color:#1E884A">Return to dashboard</a>
    </main>`;
  throw new Error("Admin access required");
}

document.getElementById("logout-button").addEventListener("click", logout);
const list = document.getElementById("client-list");
const searchInput = document.getElementById("search-input");
const statusMessage = document.getElementById("status-message");
const refreshButton = document.getElementById("refresh-button");
let allStatements = [];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}
function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
}
function formatSize(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "Size unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function parseStatus(statement) {
  const raw = String(statement.parse_status || "pending").toLowerCase();
  if (["completed", "complete", "success", "parsed", "succeeded"].includes(raw)) return { label: "Parsed", css: "done" };
  if (["failed", "error"].includes(raw)) return { label: "Failed", css: "pending" };
  return { label: raw === "pending" ? "Pending" : raw.replaceAll("_", " "), css: "pending" };
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = allStatements.filter(statement => [
    statement.user_name, statement.user_email, statement.original_filename,
    statement.bank_code, statement.parse_status
  ].some(value => String(value ?? "").toLowerCase().includes(query)));

  const groups = new Map();
  for (const statement of filtered) {
    const key = String(statement.user_id ?? statement.user_email ?? "unknown");
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        name: statement.user_name || "Unnamed client",
        email: statement.user_email || "No email available",
        documents: [],
        canSchedule: Boolean(statement.user_id)
      });
    }
    groups.get(key).canSchedule = groups.get(key).canSchedule && Boolean(statement.user_id);
    groups.get(key).documents.push(statement);
  }

  document.getElementById("client-count").textContent = new Set(allStatements.map(s => String(s.user_id ?? s.user_email ?? "unknown"))).size;
  document.getElementById("document-count").textContent = allStatements.length;
  document.getElementById("review-count").textContent = allStatements.filter(s => !["completed", "complete", "success", "parsed", "succeeded"].includes(String(s.parse_status || "pending").toLowerCase())).length;
  document.getElementById("result-summary").textContent = query
    ? `${filtered.length} matching document${filtered.length === 1 ? "" : "s"} across ${groups.size} client${groups.size === 1 ? "" : "s"}`
    : `${allStatements.length} document${allStatements.length === 1 ? "" : "s"} across ${groups.size} client${groups.size === 1 ? "" : "s"}`;

  if (!groups.size) {
    list.innerHTML = `<div class="empty-state">${allStatements.length ? "No clients or documents match your search." : "No client documents have been uploaded yet."}</div>`;
    return;
  }

  list.innerHTML = [...groups.values()].map((client, index) => `
    <details class="client-card" ${query || index === 0 ? "open" : ""}>
      <summary>
        <span class="client-info"><span class="client-name">${escapeHtml(client.name)}</span><span class="client-email">${escapeHtml(client.email)}</span></span>
        <span class="client-meta"><span class="doc-count">${client.documents.length} file${client.documents.length === 1 ? "" : "s"}</span><button class="button button-quiet view-profile" type="button" data-client-id="${escapeHtml(client.id)}">View profile</button><a class="button open-dashboard" href="/dashboard.html?client=${encodeURIComponent(client.id)}" ${client.canSchedule ? "" : "hidden"}>Open dashboard</a></span>
      </summary>
      <div class="document-list">
        ${client.documents.map(statement => {
          const status = parseStatus(statement);
          return `
            <article class="document-row">
              <div class="document-main">
                <span class="file-icon" aria-hidden="true">FILE</span>
                <div>
                  <span class="document-name">${escapeHtml(statement.original_filename || "Untitled document")}</span>
                  <div class="document-sub">
                    <span>${escapeHtml(statement.bank_code || "Bank statement")}</span>
                    <span>${escapeHtml(formatDate(statement.created_at))}</span>
                    <span>${escapeHtml(formatSize(statement.file_size))}</span>
                    <span class="status-pill ${status.css}">${escapeHtml(status.label)}</span>
                    ${statement.reconciliation_published ? '<span class="status-pill done">Published</span>' : ""}
                  </div>
                </div>
              </div>
              <div class="document-actions"><button class="button button-quiet view-file" type="button" data-id="${escapeHtml(statement.id)}">View document</button></div>
            </article>`;
        }).join("")}
      </div>
    </details>`).join("");

  list.querySelectorAll(".view-file").forEach(button => {
    button.addEventListener("click", () => openDocument(button.dataset.id, button));
  });
  list.querySelectorAll(".open-dashboard").forEach(a => a.addEventListener("click", event => event.stopPropagation()));
  list.querySelectorAll(".view-profile").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      window.location.href = `/profile.html?userId=${encodeURIComponent(button.dataset.clientId)}`;
      console.log("Client ID:", button.dataset.clientId);
    });
  });
}

async function openDocument(id, button) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Opening…";
  try {
    const token = await getJWT();
    if (!token) throw new Error("Your session has expired. Please sign in again.");
    const response = await fetch(`/api/client?action=onboarding-file&id=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || "Unable to open this document.");
    }
    const fileBlob = await response.blob();
    const fileUrl = URL.createObjectURL(fileBlob);
    const opened = window.open(fileUrl, "_blank", "noopener,noreferrer");
    if (!opened) statusMessage.textContent = "Your browser blocked the document window. Allow pop-ups and try again.";
    setTimeout(() => URL.revokeObjectURL(fileUrl), 60_000);
  } catch (error) {
    statusMessage.textContent = error.message || "Unable to open this document.";
    statusMessage.classList.add("error");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function loadDocuments() {
  refreshButton.disabled = true;
  statusMessage.classList.remove("error");
  statusMessage.textContent = "Loading client documents…";
  try {
    const result = await apiFetch("/api/finance?action=statements");
    if (!Array.isArray(result)) throw new Error("Unexpected response from the documents API.");
    allStatements = result;
    statusMessage.textContent = "";
    render();
  } catch (error) {
    statusMessage.textContent = error.message || "Could not load client documents.";
    statusMessage.classList.add("error");
    list.innerHTML = `<div class="empty-state">Documents could not be loaded. Please refresh and try again.</div>`;
  } finally {
    refreshButton.disabled = false;
  }
}

searchInput.addEventListener("input", render);
refreshButton.addEventListener("click", async () => {
  await loadDocuments();
});
await loadDocuments();


// Shared Xero connection and client organisation management.
const xero = {
  badge: document.getElementById("xero-connection-badge"),
  connectionMessage: document.getElementById("xero-connection-message"),
  connect: document.getElementById("xero-connect"),
  refresh: document.getElementById("xero-refresh"),
  disconnect: document.getElementById("xero-disconnect"),
  orgCount: document.getElementById("xero-org-count"),
  orgList: document.getElementById("xero-org-list"),
  clientSearch: document.getElementById("xero-client-search"),
  clientList: document.getElementById("xero-client-list"),
  message: document.getElementById("xero-admin-message")
};
let xeroConnected = false;
let xeroTenants = [];
let xeroClients = [];

function xeroMessage(message, error = false) {
  xero.message.textContent = message;
  xero.message.classList.toggle("error", error);
}
function renderXeroOrganisations() {
  xero.orgCount.textContent = xeroConnected ? xeroTenants.length : "—";
  if (!xeroConnected) {
    xero.orgList.innerHTML = '<p class="empty-state">Connect TeraKira to Xero to retrieve accessible organisations.</p>';
    return;
  }
  if (!xeroTenants.length) {
    xero.orgList.innerHTML = '<p class="empty-state">No organisations are accessible through this Xero connection. Check the organisations selected during authorisation.</p>';
    return;
  }
  const assigned = new Set(xeroClients.map(client => client.tenant_id).filter(Boolean));
  xero.orgList.innerHTML = xeroTenants.map(tenant => {
    const client = xeroClients.find(item => item.tenant_id === tenant.tenantId);
    return `<div class="xero-org-row"><span><strong>${escapeHtml(tenant.tenantName)}</strong><small>${escapeHtml(tenant.tenantType || "Xero organisation")}</small></span><span class="xero-assignment ${client ? "assigned" : "available"}">${client ? `Assigned to ${escapeHtml(client.name || client.email)}` : "Available"}</span></div>`;
  }).join("");
}
function renderXeroClients() {
  const query = xero.clientSearch.value.trim().toLowerCase();
  const filtered = xeroClients.filter(client => `${client.name || ""} ${client.email || ""}`.toLowerCase().includes(query));
  if (!xeroConnected) {
    xero.clientList.innerHTML = '<p class="empty-state">Connect to Xero before assigning organisations to clients.</p>';
    return;
  }
  if (!filtered.length) {
    xero.clientList.innerHTML = `<p class="empty-state">${xeroClients.length ? "No clients match your search." : "No registered client accounts found."}</p>`;
    return;
  }
  const assignedTenantIds = new Set(xeroClients.map(client => client.tenant_id).filter(Boolean));
  xero.clientList.innerHTML = filtered.map(client => {
    const current = xeroTenants.find(tenant => tenant.tenantId === client.tenant_id);
    const hasMapping = Boolean(client.tenant_id);
    const currentName = current?.tenantName || client.tenant_name || "Organisation not currently accessible";
    const options = xeroTenants.filter(tenant => !assignedTenantIds.has(tenant.tenantId) || tenant.tenantId === client.tenant_id);
    return `<article class="xero-client-row">
      <div class="xero-client-info"><strong>${escapeHtml(client.name || "Unnamed client")}</strong><small>${escapeHtml(client.email || "No email")}</small><span class="xero-assignment ${hasMapping ? (current ? "assigned" : "unassigned") : "unassigned"}">${hasMapping ? `Assigned: ${escapeHtml(currentName)}${current ? "" : " (not accessible through the current Xero connection)"}` : "No organisation assigned"}</span></div>
      <div class="xero-client-controls"><select aria-label="Xero organisation for ${escapeHtml(client.name || client.email)}" data-xero-select="${escapeHtml(client.id)}"><option value="">Select an available organisation</option>${options.map(tenant => `<option value="${escapeHtml(tenant.tenantId)}" ${tenant.tenantId === client.tenant_id ? "selected" : ""}>${escapeHtml(tenant.tenantName)}</option>`).join("")}</select>
      <button class="button" type="button" data-xero-assign="${escapeHtml(client.id)}">${hasMapping ? "Update Assignment" : "Assign Organisation"}</button>
      ${hasMapping ? `<button class="button button-quiet" type="button" data-xero-remove="${escapeHtml(client.id)}">Remove Assignment</button>` : ""}</div>
    </article>`;
  }).join("");
  xero.clientList.querySelectorAll("[data-xero-assign]").forEach(button => button.addEventListener("click", async () => {
    const clientId = button.dataset.xeroAssign;
    const select = xero.clientList.querySelector(`[data-xero-select="${CSS.escape(clientId)}"]`);
    const tenantId = select?.value;
    if (!tenantId) return xeroMessage("Select an available Xero organisation first.", true);
    const tenant = xeroTenants.find(item => item.tenantId === tenantId);
    button.disabled = true;
    try {
      await apiFetch("/api/xero?action=mapping", { method: "POST", body: JSON.stringify({ clientId, tenantId, tenantName: tenant?.tenantName }) });
      xeroMessage("Xero organisation assigned successfully.");
      await loadXeroManagement(false);
    } catch (error) { xeroMessage(error.message || "Unable to assign organisation.", true); button.disabled = false; }
  }));
  xero.clientList.querySelectorAll("[data-xero-remove]").forEach(button => button.addEventListener("click", async () => {
    const clientId = button.dataset.xeroRemove;
    const client = xeroClients.find(item => item.id === clientId);
    if (!window.confirm(`Remove the Xero organisation assignment for ${client?.name || client?.email || "this client"}? The client account and Xero data will not be deleted.`)) return;
    button.disabled = true;
    try {
      await apiFetch("/api/xero?action=mapping", { method: "DELETE", body: JSON.stringify({ clientId }) });
      xeroMessage("Organisation assignment removed.");
      await loadXeroManagement(false);
    } catch (error) { xeroMessage(error.message || "Unable to remove assignment.", true); button.disabled = false; }
  }));
}
async function loadXeroManagement(showLoading = true) {
  if (showLoading) {
    xero.connectionMessage.textContent = "Checking shared connection…";
    xero.orgList.innerHTML = '<p class="empty-state">Loading organisations…</p>';
    xero.clientList.innerHTML = '<p class="empty-state">Loading clients…</p>';
  }
  try {
    const status = await apiFetch("/api/xero?action=status");
    xeroConnected = Boolean(status.connected);
    xero.badge.textContent = xeroConnected ? "Connected" : "Disconnected";
    xero.badge.classList.toggle("connected", xeroConnected);
    xero.badge.classList.toggle("disconnected", !xeroConnected);
    xero.connectionMessage.textContent = xeroConnected
      ? `Connected to Xero. Last updated ${formatDate(status.updatedAt)}.`
      : "TeraKira is not connected to Xero. An administrator must connect the shared account before organisations can be assigned.";
    xero.connect.disabled = xeroConnected;
    xero.refresh.disabled = !xeroConnected;
    xero.disconnect.disabled = !xeroConnected;
    if (xeroConnected) {
      const [tenants, clients] = await Promise.all([
        apiFetch("/api/xero?action=tenants"),
        apiFetch("/api/xero?action=users")
      ]);
      xeroTenants = Array.isArray(tenants) ? tenants : [];
      xeroClients = Array.isArray(clients) ? clients : [];
    } else {
      xeroTenants = [];
      xeroClients = await apiFetch("/api/xero?action=users");
    }
    renderXeroOrganisations();
    renderXeroClients();
    return true;
  } catch (error) {
    xero.connectionMessage.textContent = error.message || "Unable to check the Xero connection.";
    xero.orgList.innerHTML = '<p class="empty-state">Could not load Xero organisations. Please try again.</p>';
    xero.clientList.innerHTML = '<p class="empty-state">Could not load client mappings.</p>';
    xeroMessage(error.message || "Xero management could not be loaded.", true);
    return false;
  }
}
xero.connect.addEventListener("click", async () => {
  xero.connect.disabled = true;
  xero.connect.textContent = "Connecting…";
  try {
    const result = await apiFetch("/api/xero?action=connect", { method: "POST" });
    if (!result.authorizationUrl) throw new Error("Xero did not return an authorisation URL.");
    window.location.assign(result.authorizationUrl);
  } catch (error) {
    xeroMessage(error.message || "Unable to start Xero connection.", true);
    xero.connect.disabled = false;
    xero.connect.textContent = "Connect to Xero";
  }
});
xero.refresh.addEventListener("click", async () => {
  xero.refresh.disabled = true;
  xero.refresh.textContent = "Refreshing…";
  try {
    const refreshed = await loadXeroManagement(false);
    if (refreshed) xeroMessage("Organisations refreshed.");
  } finally { xero.refresh.textContent = "Refresh Organisations"; xero.refresh.disabled = !xeroConnected; }
});
xero.disconnect.addEventListener("click", async () => {
  if (!window.confirm("Disconnect the shared TeraKira Xero connection? Existing client organisation mappings will be kept, but clients cannot retrieve Xero data until reconnected.")) return;
  xero.disconnect.disabled = true;
  try {
    await apiFetch("/api/xero?action=disconnect", { method: "POST" });
    xeroMessage("Xero disconnected. Existing client mappings have been retained.");
    await loadXeroManagement(false);
  } catch (error) { xeroMessage(error.message || "Unable to disconnect Xero.", true); xero.disconnect.disabled = false; }
});
xero.clientSearch.addEventListener("input", renderXeroClients);
const xeroCallback = new URLSearchParams(window.location.search).get("xero");
if (xeroCallback) {
  const messages = { connected: "TeraKira has successfully connected to Xero.", denied: "Xero authorisation was cancelled.", error: "Xero connection failed. Check the server logs and Xero configuration." };
  xeroMessage(messages[xeroCallback] || "Xero authorisation returned.", xeroCallback !== "connected");
  history.replaceState({}, "", window.location.pathname);
}
await loadXeroManagement();
