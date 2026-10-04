import { getAppUser, logout } from "./auth-guard.js";
import { getJWT } from "./auth.js";
import { apiFetch } from "./api.js";

const user = await getAppUser();
if (!user) throw new Error("Authentication required");
if (user.role !== "admin") {
  document.body.innerHTML = `
    <main style="max-width:560px;margin:12vh auto;padding:24px;font:16px system-ui;color:#e5f0ea">
      <h1>Access denied</h1><p>This page is available to administrator accounts only.</p>
      <a href="/dashboard.html" style="color:#63cfa7">Return to dashboard</a>
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
        documents: []
      });
    }
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
        <span class="client-meta"><span class="doc-count">${client.documents.length} file${client.documents.length === 1 ? "" : "s"}</span></span>
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
}

async function openDocument(id, button) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Opening…";
  try {
    const token = await getJWT();
    if (!token) throw new Error("Your session has expired. Please sign in again.");
    const response = await fetch(`/api/statement-file?id=${encodeURIComponent(id)}`, {
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
    const result = await apiFetch("/api/statements");
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
refreshButton.addEventListener("click", loadDocuments);
await loadDocuments();
