import { NextResponse } from "next/server";
import { backendFetch, setSessionCookies } from "../../../../lib/backend";

export async function POST(request: Request) {
  const body = await request.text();
  const response = await backendFetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const data = await response.json().catch(() => null);

  if (!response.ok || data === null) {
    return NextResponse.json(
      data ?? { message: "Authentication failed" },
      { status: response.status },
    );
  }

  await setSessionCookies(data);

  return NextResponse.json({ user: data.user });
}
