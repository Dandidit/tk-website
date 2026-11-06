import { createAuthClient } from "https://cdn.jsdelivr.net/npm/@neondatabase/auth@0.5.0-beta/+esm";

const authUrl = window.TERAKIRA_CONFIG?.NEON_AUTH_URL;

if (!authUrl) {
  console.error("FATAL: NEON_AUTH_URL is not configured in environment variables.");
  throw new Error("NEON_AUTH_URL is not configured.");
}

// Route auth through this site's own origin (see rewrite in vercel.json) so the
// session cookie is first-party. Safari/iOS blocks it when set by neon.tech.
export const authClient = createAuthClient(`${window.location.origin}/neon-auth`);

export async function signIn(email, password) {
  return await authClient.signIn.email({ email, password });
}

export async function signUp(name, email, password) {
  return await authClient.signUp.email({ name, email, password });
}

export async function getSession() {
  return await authClient.getSession();
}

export async function getCurrentUser() {
  const result = await getSession();
  return result?.data?.user ?? result?.user ?? null;
}

export async function getJWT() {
  const result = await authClient.getSession();

  return result?.data?.session?.token ?? null;
}

export async function signOut() {
  return await authClient.signOut();
}
