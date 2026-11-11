import { NextRequest, NextResponse } from "next/server";
import { authorizedBackendFetch } from "../../../../../lib/backend";
import { isSameOriginAction } from "../../../../../lib/same-origin";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; action: string }> }) {
  if (!isSameOriginAction(request.headers)) return NextResponse.json({ message: "Invalid origin" }, { status: 403 });
  const companyId = request.nextUrl.searchParams.get("companyId")?.trim();
  const { id, action } = await context.params;
  if (!companyId || !["inspect", "resume", "reconcile"].includes(action)) return NextResponse.json({ message: "Invalid request" }, { status: 400 });
  const decision: unknown = action === "reconcile" ? await request.json().catch(() => null) : null;
  if (action === "reconcile" && (!decision || typeof decision !== "object" || Array.isArray(decision))) {
    return NextResponse.json({ message: "Invalid decision" }, { status: 400 });
  }
  const response = await authorizedBackendFetch(`/workflows/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
    headers: { "X-Company-Id": companyId, ...(decision ? { "Content-Type": "application/json" } : {}) },
    body: decision ? JSON.stringify(decision) : undefined,
  });
  return NextResponse.json(await response.json().catch(() => ({ message: "Unable to process execution" })), { status: response.status });
}
