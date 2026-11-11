import { NextResponse } from "next/server";
import { backendFetch, setSessionCookies } from "../../../../lib/backend";
import { isSameOriginAction } from "../../../../lib/same-origin";

export async function POST(request: Request) {
  if (!isSameOriginAction(request.headers)) return NextResponse.json({ message: "Invalid origin" }, { status: 403 });
  const body = await request.text();
  const response = await backendFetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const data = await response.json().catch(() => null);

  if (!response.ok || data === null) {
    const retryAfter = response.headers.get("retry-after");
    return NextResponse.json(
      data ?? { message: "Authentication failed" },
      { status: response.status, headers: retryAfter ? { "Retry-After": retryAfter } : undefined },
    );
  }

  await setSessionCookies(data);

  return NextResponse.json({ user: data.user });
}
