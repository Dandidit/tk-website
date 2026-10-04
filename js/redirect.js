import { getJWT } from "./auth.js";

export async function redirectAfterLogin() {
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