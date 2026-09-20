import { getAppUser, logout } from "./auth-guard.js";
import { apiFetch } from "./api.js";

const user = await getAppUser();
if (!user) throw new Error("Authentication required");

document.getElementById("welcome").textContent =
  `Welcome, ${user.name || user.email}`;

document.getElementById("role").textContent = user.role;

document.getElementById("logout-button").addEventListener("click", logout);

const uploadForm = document.getElementById("upload-form");
const uploadInput = document.getElementById("statement-file");
const uploadMessage = document.getElementById("upload-message");
const statementList = document.getElementById("statement-list");

async function loadStatements() {
  const statements = await apiFetch("/api/statements");
  statementList.innerHTML = "";

  for (const statement of statements) {
    const row = document.createElement("div");
    row.className = "statement-row";

    row.innerHTML = `
      <div>
        <strong>${escapeHtml(statement.original_filename)}</strong>
        <div>${statement.bank_code} · ${statement.parse_status}</div>
      </div>
      <div>
        <button data-file="${statement.id}" class="file-button">View PDF</button>
        ${user.role === "admin" ? `<button data-id="${statement.id}" class="parse-button">Parse</button>` : ""}
        ${
          user.role === "admin"
            ? `<button data-publish="${statement.id}" class="publish-button">
                 ${statement.reconciliation_published ? "Published" : "Publish"}
               </button>`
            : ""
        }
      </div>
    `;

    statementList.appendChild(row);
  }

  document.querySelectorAll(".file-button").forEach(button => {
    button.addEventListener("click", async () => {
      try {
        const token = await (await import("./auth.js")).getJWT();
        const response = await fetch(`/api/statement-file?id=${encodeURIComponent(button.dataset.file)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) throw new Error("Unable to open PDF.");

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank", "noopener");
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (error) {
        alert(error.message);
      }
    });
  });

  document.querySelectorAll(".parse-button").forEach(button => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await apiFetch("/api/parse-statement", {
          method: "POST",
          body: JSON.stringify({ statementId: button.dataset.id })
        });
        await loadStatements();
      } catch (error) {
        alert(error.message);
      } finally {
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll(".publish-button").forEach(button => {
    button.addEventListener("click", async () => {
      try {
        await apiFetch("/api/statements", {
          method: "PATCH",
          body: JSON.stringify({
            id: button.dataset.publish,
            action: "publish"
          })
        });
        await loadStatements();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const file = uploadInput.files[0];

  if (!file) return;

  if (file.type !== "application/pdf") {
    uploadMessage.textContent = "Only PDF files are allowed.";
    return;
  }

  uploadMessage.textContent = "Uploading...";

  try {
    const { upload } = await import(
      "https://cdn.jsdelivr.net/npm/@vercel/blob@1.1.1/+esm"
    );

    const blob = await upload(
      `bank-statements/${user.id}/${Date.now()}-${file.name}`,
      file,
      {
        access: "private",
        handleUploadUrl: "/api/upload"
      }
    );

    const statement = await apiFetch("/api/statements", {
      method: "POST",
      body: JSON.stringify({
        originalFilename: file.name,
        storageUrl: blob.url,
        storagePath: blob.pathname,
        fileSize: file.size
      })
    });

    uploadMessage.textContent = "Uploaded. Parsing statement...";

    await apiFetch("/api/parse-statement", {
      method: "POST",
      body: JSON.stringify({ statementId: statement.id })
    });

    uploadMessage.textContent = "Upload complete.";
    uploadForm.reset();
    await loadStatements();
  } catch (error) {
    console.error(error);
    uploadMessage.textContent = error.message || "Upload failed.";
  }
});

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

await loadStatements();


const calendarList = document.getElementById("calendar-list");
const adminPanel = document.getElementById("admin-appointment-panel");
const appointmentForm = document.getElementById("appointment-form");

if (user.role === "admin") {
  adminPanel.hidden = false;
}

async function loadAppointments() {
  const appointments = await apiFetch("/api/appointments");
  calendarList.innerHTML = "";

  if (!appointments.length) {
    calendarList.textContent = "No appointments.";
    return;
  }

  for (const appointment of appointments) {
    const item = document.createElement("div");
    item.className = "appointment-row";
    item.innerHTML = `
      <strong>${escapeHtml(appointment.title)}</strong>
      <span>${new Date(appointment.start_at).toLocaleString()} -
      ${new Date(appointment.end_at).toLocaleString()}</span>
      ${user.role === "admin" ? `<span>${escapeHtml(appointment.user_name || appointment.user_email || appointment.user_id)}</span>` : ""}
      <span>${escapeHtml(appointment.status)}</span>
    `;
    calendarList.appendChild(item);
  }
}

appointmentForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    await apiFetch("/api/appointments", {
      method: "POST",
      body: JSON.stringify({
        userId: document.getElementById("appointment-user").value.trim(),
        title: document.getElementById("appointment-title").value.trim(),
        startAt: document.getElementById("appointment-start").value,
        endAt: document.getElementById("appointment-end").value,
        notes: document.getElementById("appointment-notes").value.trim()
      })
    });

    appointmentForm.reset();
    await loadAppointments();
  } catch (error) {
    alert(error.message);
  }
});

await loadAppointments();
