import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { backendFetch, clearSessionCookies } from "../../../../lib/backend";
import { isSameOriginAction } from "../../../../lib/same-origin";

export async function POST(request: Request) {
  if (!isSameOriginAction(request.headers)) return NextResponse.json({ message: "Invalid origin" }, { status: 403 });
  const store = await cookies();
  const refreshToken = store.get("plataforma_refresh")?.value;

  if (refreshToken) {
    await backendFetch("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => null);
  }

  await clearSessionCookies();
  return NextResponse.json({ success: true });
}
