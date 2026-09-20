import { signIn, getCurrentUser } from "./auth.js";

const form = document.getElementById("login-form");
const button = document.getElementById("login-button");
const errorBox = document.getElementById("login-error");

function showError(message) {
  errorBox.textContent = message;
  errorBox.style.display = "block";
}

function clearError() {
  errorBox.textContent = "";
  errorBox.style.display = "none";
}

async function redirectIfAlreadyLoggedIn() {
  try {
    const user = await getCurrentUser();

    if (user) {
      window.location.href = "/dashboard.html";
    }
  } catch {
    // No active session.
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  button.disabled = true;
  button.textContent = "Signing in...";

  try {
    const result = await signIn(email, password);

    if (result?.error) {
      showError(result.error.message || "Invalid email or password.");
      return;
    }

    window.location.href = "/dashboard.html";
  } catch (error) {
    console.error(error);
    showError("Unable to sign in. Please try again.");
  } finally {
    button.disabled = false;
    button.textContent = "Sign in";
  }
});

redirectIfAlreadyLoggedIn();
