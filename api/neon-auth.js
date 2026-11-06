// Same-origin proxy for Neon Auth. A plain Vercel rewrite forwards the site's Host
// header, which Neon rejects (INVALID_HOSTNAME). Fetching from here sets the right
// Host, while the browser sees first-party cookies (iOS Safari blocks third-party).
const UPSTREAM = "https://ep-tiny-haze-azrhc4h9.neonauth.c-3.ap-southeast-1.aws.neon.tech/neondb/auth";
const FORWARD = ["content-type", "cookie", "origin", "authorization", "user-agent", "accept", "accept-language"];

async function proxy(request) {
  const url = new URL(request.url);
  const path = (url.searchParams.get("path") || "").replace(/^\/+/, "");
  url.searchParams.delete("path");
  const qs = url.searchParams.toString();
  const target = `${UPSTREAM}/${path}${qs ? `?${qs}` : ""}`;

  const headers = new Headers();
  for (const name of FORWARD) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const hasBody = !["GET", "HEAD"].includes(request.method);
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: "manual"
  });

  const out = new Headers();
  upstream.headers.forEach((value, name) => {
    const n = name.toLowerCase();
    if (["content-encoding", "content-length", "transfer-encoding", "connection", "set-cookie"].includes(n)) return;
    out.set(name, value);
  });
  // Make cookies host-only on this site.
  for (const cookie of upstream.headers.getSetCookie()) {
    out.append("set-cookie", cookie.replace(/;\s*domain=[^;]*/i, ""));
  }

  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
