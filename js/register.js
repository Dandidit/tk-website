import { signUp, getCurrentUser } from "./auth.js";
import { redirectAfterLogin } from "./redirect.js";

const $ = (id) => document.getElementById(id);
const form = $("register-form");
const button = $("register-button");
const errorBox = $("register-error");
const noticeBox = $("register-notice");
const fields = { name: $("name"), email: $("email"), password: $("password"), confirm: $("confirm") };

function showError(message) {
  noticeBox.style.display = "none";
  errorBox.textContent = message;
  errorBox.style.display = "block";
  errorBox.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
function clearMessages() {
  errorBox.style.display = "none";
  noticeBox.style.display = "none";
}
function setHint(id, text, state) {
  const el = $(`${id}-hint`);
  el.textContent = text;
  el.className = `field-hint${state ? " " + state : ""}`;
  fields[id].setAttribute("aria-invalid", state === "bad" ? "true" : "false");
}

function strength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return pw ? Math.max(1, score) : 0;
}

const validators = {
  name() {
    if (!fields.name.value.trim()) { setHint("name", "Please enter your name.", "bad"); return false; }
    setHint("name", ""); return true;
  },
  email() {
    const v = fields.email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { setHint("email", "Enter a valid email address.", "bad"); return false; }
    setHint("email", ""); return true;
  },
  password() {
    const pw = fields.password.value;
    const level = strength(pw);
    $("strength").dataset.level = String(pw.length < 8 ? Math.min(level, 1) : level);
    if (pw.length < 8) { setHint("password", `Use at least 8 characters (${pw.length}/8).`, pw ? "bad" : ""); return false; }
    setHint("password", ["", "Weak", "Fair", "Good", "Strong"][level] + " password.", level >= 3 ? "ok" : "");
    return true;
  },
  confirm() {
    if (!fields.confirm.value) { setHint("confirm", ""); return false; }
    const match = fields.confirm.value === fields.password.value;
    setHint("confirm", match ? "Passwords match." : "Passwords do not match.", match ? "ok" : "bad");
    return match;
  }
};

// Validate a field once the user leaves it, then live while typing.
Object.keys(fields).forEach((key) => {
  fields[key].addEventListener("blur", () => { fields[key].dataset.touched = "1"; validators[key](); if (key === "password" && fields.confirm.value) validators.confirm(); });
  fields[key].addEventListener("input", () => {
    if (key === "password") { validators.password(); if (fields.confirm.value) validators.confirm(); }
    else if (key === "confirm" || fields[key].dataset.touched) validators[key]();
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessages();

  const results = Object.keys(validators).map((k) => validators[k]());
  if (!fields.confirm.value) setHint("confirm", "Please confirm your password.", "bad");
  if (results.includes(false)) {
    Object.values(fields).find((f) => f.getAttribute("aria-invalid") === "true")?.focus();
    return;
  }

  const name = fields.name.value.trim();
  const email = fields.email.value.trim();
  const password = fields.password.value;

  button.disabled = true;
  button.textContent = "Creating account...";

  try {
    const result = await signUp(name, email, password);

    if (result?.error) {
      const msg = result.error.message || "Unable to create account.";
      showError(/exist|already|taken/i.test(msg) ? "An account with this email already exists. Try signing in instead." : msg);
      return;
    }

    sessionStorage.removeItem("terakira-onboarding-v1");
    const user = await getCurrentUser();

    if (user) {
      button.textContent = "Welcome! Redirecting...";
      await redirectAfterLogin();
      return;
    }

    form.reset();
    $("strength").dataset.level = "0";
    noticeBox.textContent = "Account created! Please check your email to verify your address, then sign in.";
    noticeBox.style.display = "block";
  } catch (error) {
    console.error(error);
    showError(`Unable to create account. Please try again. [${error?.message || error}]`);
  } finally {
    button.disabled = false;
    button.textContent = "Create account";
  }
});
