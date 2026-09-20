import { getCurrentUser, getJWT, signOut } from "./auth.js";

export async function requireAuth() {
  const user = await getCurrentUser();

  if (!user) {
    window.location.href = "/login.html";
    return null;
  }

  return user;
}

export async function getAppUser() {
  const token = await getJWT();

  const response = await fetch("/api/me", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    window.location.href = "/login.html";
    return null;
  }

  return await response.json();
}

export async function logout() {
  await signOut();
  window.location.href = "/login.html";
}
