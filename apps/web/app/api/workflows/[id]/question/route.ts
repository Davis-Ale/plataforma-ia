import { NextRequest, NextResponse } from "next/server";
import { authorizedBackendFetch } from "../../../../../lib/backend";
import { isSameOriginAction } from "../../../../../lib/same-origin";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSameOriginAction(request.headers)) return NextResponse.json({ message: "Invalid origin" }, { status: 403 });
  const companyId = request.nextUrl.searchParams.get("companyId")?.trim();
  if (!companyId) return NextResponse.json({ message: "Company is required" }, { status: 400 });
  const data: unknown = await request.json().catch(() => null);
  if (!data || typeof data !== "object" || Array.isArray(data)) return NextResponse.json({ message: "Invalid question" }, { status: 400 });
  const { id } = await context.params;
  const response = await authorizedBackendFetch(`/workflows/${encodeURIComponent(id)}/question`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Company-Id": companyId }, body: JSON.stringify(data),
  });
  return NextResponse.json(await response.json().catch(() => ({ message: "Unable to answer question" })), { status: response.status });
}
