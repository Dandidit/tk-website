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
let allAppointments = [];
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedClient = null;
const calendar = document.getElementById("appointment-calendar");
const calendarSummary = document.getElementById("calendar-summary");
const appointmentModal = document.getElementById("appointment-modal");
const appointmentForm = document.getElementById("appointment-form");
const appointmentMessage = document.getElementById("appointment-message");
const appointmentStart = document.getElementById("appointment-start");
const appointmentSave = document.getElementById("appointment-save");

function toLocalInputValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function openAppointment(client) {
  selectedClient = client;
  appointmentForm.reset();
  appointmentForm.elements.title.value = "Client consultation";
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  appointmentStart.min = toLocalInputValue(new Date());
  appointmentStart.value = toLocalInputValue(start);
  document.getElementById("appointment-client").textContent = `${client.name} · ${client.email}`;
  appointmentMessage.textContent = "";
  appointmentMessage.classList.remove("error");
  appointmentModal.hidden = false;
  appointmentForm.elements.title.focus();
}
function closeAppointment() {
  appointmentModal.hidden = true;
  selectedClient = null;
}

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
function renderCalendar() {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const start = new Date(year, month, 1 - firstDay.getDay());
  const today = new Date();
  const monthAppointments = allAppointments.filter(item => {
    const date = new Date(item.start_at);
    return !Number.isNaN(date.getTime()) && date.getFullYear() === year && date.getMonth() === month;
  });

  calendarSummary.textContent = `${calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })} · ${monthAppointments.length} appointment${monthAppointments.length === 1 ? "" : "s"}`;
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let html = `<div class="calendar-weekdays">${weekdays.map(day => `<span>${day}</span>`).join("")}</div><div class="calendar-grid">`;

  for (let i = 0; i < 42; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const dayAppointments = allAppointments.filter(item => {
      const eventDate = new Date(item.start_at);
      return !Number.isNaN(eventDate.getTime()) && eventDate.getFullYear() === date.getFullYear() && eventDate.getMonth() === date.getMonth() && eventDate.getDate() === date.getDate();
    }).sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
    const classes = ["calendar-day"];
    if (date.getMonth() !== month) classes.push("outside-month");
    if (date.toDateString() === today.toDateString()) classes.push("is-today");
    html += `<div class="${classes.join(" ")}"><span class="calendar-day-number">${date.getDate()}</span>`;
    dayAppointments.slice(0, 3).forEach(item => {
      const time = new Date(item.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const clientName = item.user_name || item.user_email || "Client";
      const cancelled = String(item.status || "scheduled").toLowerCase() === "cancelled";
      html += `<button type="button" class="calendar-event${cancelled ? " cancelled" : ""}" data-appointment-id="${escapeHtml(item.id)}" title="${escapeHtml(`${time} · ${item.title} · ${clientName}`)}"><span>${escapeHtml(time)} ${escapeHtml(item.title || "Appointment")}</span><span>${escapeHtml(clientName)}</span></button>`;
    });
    if (dayAppointments.length > 3) html += `<span class="calendar-event-more">+${dayAppointments.length - 3} more</span>`;
    html += `</div>`;
  }
  html += `</div>`;
  if (!allAppointments.length) html += `<div class="calendar-empty">No appointments scheduled yet.</div>`;
  calendar.innerHTML = html;
  calendar.querySelectorAll(".calendar-event").forEach(button => button.addEventListener("click", () => {
    const item = allAppointments.find(appointment => String(appointment.id) === button.dataset.appointmentId);
    if (!item) return;
    const startAt = new Date(item.start_at);
    const endAt = new Date(item.end_at);
    window.alert(`${item.title || "Appointment"}\nClient: ${item.user_name || item.user_email || "Unknown client"}\nWhen: ${startAt.toLocaleString()} – ${endAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${item.notes ? `\nNotes: ${item.notes}` : ""}${item.status ? `\nStatus: ${item.status}` : ""}`);
  }));
}

async function loadAppointments() {
  calendarSummary.textContent = "Loading appointments…";
  try {
    const result = await apiFetch("/api/appointments");
    if (!Array.isArray(result)) throw new Error("Unexpected response from appointments API.");
    allAppointments = result;
    renderCalendar();
  } catch (error) {
    calendarSummary.textContent = "Could not load appointments.";
    calendar.innerHTML = `<div class="calendar-empty calendar-error">${escapeHtml(error.message || "Please refresh and try again.")}</div>`;
  }
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
        <span class="client-meta"><span class="doc-count">${client.documents.length} file${client.documents.length === 1 ? "" : "s"}</span><button class="button button-quiet view-profile" type="button" data-client-id="${escapeHtml(client.id)}">View profile</button><button class="button set-appointment" type="button" data-client-id="${escapeHtml(client.id)}" data-client-name="${escapeHtml(client.name)}" data-client-email="${escapeHtml(client.email)}" ${client.canSchedule ? "" : "disabled title=\"Client account ID unavailable\""}>Set appointment</button></span>
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
  list.querySelectorAll(".set-appointment").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      openAppointment({ id: button.dataset.clientId, name: button.dataset.clientName, email: button.dataset.clientEmail });
    });
  });
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

appointmentForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!selectedClient) return;

  const start = new Date(appointmentStart.value);
  const duration = Number(document.getElementById("appointment-duration").value);
  if (!Number.isFinite(start.getTime()) || start <= new Date()) {
    appointmentMessage.textContent = "Choose a future date and time.";
    appointmentMessage.classList.add("error");
    return;
  }

  appointmentSave.disabled = true;
  appointmentSave.textContent = "Saving…";
  appointmentMessage.textContent = "";
  appointmentMessage.classList.remove("error");
  try {
    const clientName = selectedClient.name;
    await apiFetch("/api/appointments", {
      method: "POST",
      body: JSON.stringify({
        userId: selectedClient.id,
        title: appointmentForm.elements.title.value.trim(),
        startAt: start.toISOString(),
        endAt: new Date(start.getTime() + duration * 60000).toISOString(),
        notes: appointmentForm.elements.notes.value.trim()
      })
    });
    closeAppointment();
    statusMessage.classList.remove("error");
    statusMessage.textContent = `Appointment saved for ${clientName}.`;
    await loadAppointments();
  } catch (error) {
    appointmentMessage.textContent = error.message || "Could not save the appointment.";
    appointmentMessage.classList.add("error");
  } finally {
    appointmentSave.disabled = false;
    appointmentSave.textContent = "Save appointment";
  }
});

document.querySelectorAll(".appointment-close, .appointment-cancel").forEach(button => button.addEventListener("click", closeAppointment));
appointmentModal.addEventListener("click", event => { if (event.target === appointmentModal) closeAppointment(); });
document.addEventListener("keydown", event => { if (event.key === "Escape" && !appointmentModal.hidden) closeAppointment(); });
searchInput.addEventListener("input", render);
refreshButton.addEventListener("click", async () => {
  await Promise.all([loadDocuments(), loadAppointments()]);
});
document.getElementById("calendar-prev").addEventListener("click", () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
  renderCalendar();
});
document.getElementById("calendar-next").addEventListener("click", () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
  renderCalendar();
});
document.getElementById("calendar-today").addEventListener("click", () => {
  calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  renderCalendar();
});
await Promise.all([loadDocuments(), loadAppointments()]);
