import { getJWT } from "./auth.js";

export async function redirectAfterLogin() {
  const token = await getJWT();

  const meResponse = await fetch("/api/account?action=me", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });

  if (!meResponse.ok) {
    throw new Error("Unable to check account.");
  }

  const user = await meResponse.json();
  if (user.role === "admin") {
    window.location.href = "/admin.html";
    return;
  }

  const response = await fetch("/api/client?action=onboarding", {
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