// Blob paths are scoped per user so one user cannot register another user's file.

export const statementPrefix = userId => `bank-statements/${userId}/`;
export const onboardingPrefix = userId => `onboarding/${userId}/`;

// Accepts a blob pathname or a Vercel Blob URL; returns the decoded pathname or null.
export function blobPathname(ref) {
  if (typeof ref !== "string" || !ref) return null;
  try {
    let path = ref;
    if (/^https?:\/\//i.test(ref)) {
      const url = new URL(ref);
      if (!url.hostname.endsWith(".blob.vercel-storage.com")) return null;
      path = url.pathname;
    }
    path = decodeURIComponent(path).replace(/^\/+/, "");
    if (path.split("/").some(seg => seg === ".." || seg === ".")) return null;
    return path;
  } catch {
    return null;
  }
}

export function isOwnedBlob(ref, prefix) {
  const path = blobPathname(ref);
  return !!path && path.startsWith(prefix);
}
