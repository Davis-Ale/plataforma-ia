import { NextRequest, NextResponse } from "next/server";
import { authorizedBackendFetch } from "../../../../lib/backend";
import { isSameOriginAction } from "../../../../lib/same-origin";

export async function POST(request: NextRequest) {
  if (!isSameOriginAction(request.headers)) return NextResponse.json({ message: "Invalid origin" }, { status: 403 });
  const companyId = request.nextUrl.searchParams.get("companyId")?.trim();
  const data: unknown = await request.json().catch(() => null);
  if (!companyId || !data || typeof data !== "object" || Array.isArray(data)) {
    return NextResponse.json({ message: "Invalid operation" }, { status: 400 });
  }
  const { contractExternalRef, operationId } = data as Record<string, unknown>;
  if (typeof contractExternalRef !== "string" || !contractExternalRef.trim() || contractExternalRef.length > 255 ||
    typeof operationId !== "string" || !/^[a-f0-9]{32}$/.test(operationId)) {
    return NextResponse.json({ message: "Invalid operation" }, { status: 400 });
  }
  const response = await authorizedBackendFetch("/scenarios/operations/prepare-from-contract", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Company-Id": companyId },
    body: JSON.stringify({ contractExternalRef: contractExternalRef.trim(), operationId }),
  });
  if (!response.ok) return NextResponse.json({ message: "Unable to start operation" }, { status: response.status });
  const result = await response.json().catch(() => null);
  if (!result || typeof result.success !== "boolean") {
    return NextResponse.json({ message: "Invalid operation response" }, { status: 502 });
  }
  return NextResponse.json({
    workflowRunId: typeof result.workflowRunId === "string" ? result.workflowRunId : undefined,
    error: typeof result.error === "string" ? result.error : undefined,
  }, { status: response.status });
}
