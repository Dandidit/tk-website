import { getJWT } from "./auth.js";

export async function redirectAfterLogin() {
  const token = await getJWT();
  if (!token) {
    throw new Error("STEP1: signed in but no session token (browser may be blocking the auth cookie)");
  }

  const meResponse = await fetch("/api/account?action=me", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });

  if (!meResponse.ok) {
    throw new Error(`STEP2: account check failed (HTTP ${meResponse.status})`);
  }

  const user = await meResponse.json();
  if (user.role === "admin") {
    window.location.href = "/dashboard.html";
    return;
  }

  const response = await fetch("/api/client?action=onboarding", {
    headers: {
      Authorization: `Bearer ${token}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`STEP3: onboarding check failed (HTTP ${response.status})`);
  }

  const data = await response.json();

  window.location.href = data.completed
    ? "/dashboard.html"
    : "/onboarding.html";
}