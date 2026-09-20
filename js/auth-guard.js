import { getCurrentUser, signOut } from "./auth.js";

export async function requireAuth() {
  const user = await getCurrentUser();

  if (!user) {
    window.location.href = "/login.html";
    return null;
  }

  return user;
}

export async function logout() {
  await signOut();
  window.location.href = "/login.html";
}
