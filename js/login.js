import { signIn, getCurrentUser, getJWT } from "./auth.js";

const form = document.getElementById("login-form");
const button = document.getElementById("login-button");
const errorBox = document.getElementById("login-error");

async function redirectAfterLogin() {
  const token = await getJWT();

  const response = await fetch("/api/onboarding", {
    headers: {
      Authorization: `Bearer ${token}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Unable to check onboarding status.");
  }

  const data = await response.json();

  window.location.href = data.completed
    ? "/dashboard.html"
    : "/onboarding.html";
}

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
      console.log("Curent user: ", user)

      // window.location.href = "/dashboard.html";
      // await redirectAfterLogin();
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

    // window.location.href = "/dashboard.html";
    await redirectAfterLogin();
  } catch (error) {
    console.error(error);
    showError("Unable to sign in. Please try again.");
  } finally {
    button.disabled = false;
    button.textContent = "Sign in";
  }
});

redirectIfAlreadyLoggedIn();
