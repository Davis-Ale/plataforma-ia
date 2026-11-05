import { NextRequest, NextResponse } from "next/server";
import { authorizedBackendFetch } from "../../../../../lib/backend";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; action: string }> }) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) return NextResponse.json({ message: "Invalid origin" }, { status: 403 });
  const companyId = request.nextUrl.searchParams.get("companyId")?.trim();
  const { id, action } = await context.params;
  if (!companyId || !["inspect", "resume"].includes(action)) return NextResponse.json({ message: "Invalid request" }, { status: 400 });
  const response = await authorizedBackendFetch(`/workflows/${encodeURIComponent(id)}/${action}`, {
    method: "POST", headers: { "X-Company-Id": companyId },
  });
  return NextResponse.json(await response.json().catch(() => ({ message: "Unable to process execution" })), { status: response.status });
}
