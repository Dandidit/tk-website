import { signUp, getCurrentUser } from "./auth.js";

const form = document.getElementById("register-form");
const button = document.getElementById("register-button");
const errorBox = document.getElementById("register-error");

function showError(message) {
  errorBox.textContent = message;
  errorBox.style.display = "block";
}

function clearError() {
  errorBox.textContent = "";
  errorBox.style.display = "none";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  button.disabled = true;
  button.textContent = "Creating account...";

  try {
    const result = await signUp(name, email, password);

    if (result?.error) {
      showError(result.error.message || "Unable to create account.");
      return;
    }

    const user = await getCurrentUser();

    if (user) {
      window.location.href = "/dashboard.html";
      return;
    }

    errorBox.textContent =
      "Account created. Please check your email to continue.";
    errorBox.style.display = "block";

  } catch (error) {
    console.error(error);
    showError("Unable to create account. Please try again.");
  } finally {
    button.disabled = false;
    button.textContent = "Create account";
  }
});