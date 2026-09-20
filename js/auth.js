import { createAuthClient } from "https://cdn.jsdelivr.net/npm/@neondatabase/auth@0.4.2-beta/+esm";

const authUrl = window.TERAKIRA_CONFIG?.NEON_AUTH_URL;

if (!authUrl) {
  throw new Error("NEON_AUTH_URL is not configured.");
}

export const authClient = createAuthClient(authUrl);

export async function signIn(email, password) {
  return await authClient.signIn.email({
    email,
    password
  });
}

export async function getSession() {
  return await authClient.getSession();
}

export async function getCurrentUser() {
  const result = await getSession();
  return result?.data?.user ?? result?.user ?? null;
}

export async function signOut() {
  return await authClient.signOut();
}

export async function signUp(name, email, password) {
  return await authClient.signUp.email({
    name,
    email,
    password
  });
}