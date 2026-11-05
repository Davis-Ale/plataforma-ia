export function isSameOriginAction(headers: Headers): boolean {
  const origin = headers.get("origin");
  const host = headers.get("host");
  if (!origin || !host || headers.get("sec-fetch-site") !== "same-origin") return false;
  try {
    const url = new URL(origin);
    return ["http:", "https:"].includes(url.protocol) && url.host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}
