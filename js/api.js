import { getJWT } from "./auth.js";

let tokenCache = { value: null, at: 0 };
async function cachedJWT() {
  if (tokenCache.value && Date.now() - tokenCache.at < 60000) return tokenCache.value;
  const value = await getJWT();
  tokenCache = { value, at: Date.now() };
  return value;
}

export async function apiFetch(url, options = {}) {
  const token = await cachedJWT();

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);

  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (response.status === 401) {
    tokenCache = { value: null, at: 0 };
    window.location.href = "/login.html";
    throw new Error("Unauthorized");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}
