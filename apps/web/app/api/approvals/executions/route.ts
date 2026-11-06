import { NextRequest, NextResponse } from "next/server";
import { authorizedBackendFetch } from "../../../../lib/backend";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId")?.trim();
  if (!companyId) return NextResponse.json({ message: "Company is required" }, { status: 400 });
  const query = new URLSearchParams();
  for (const key of ["page", "status"]) {
    const value = request.nextUrl.searchParams.get(key);
    if (value !== null) query.set(key, value);
  }
  const response = await authorizedBackendFetch(`/approvals/executions?${query.toString()}`, { headers: { "X-Company-Id": companyId } });
  return NextResponse.json(await response.json().catch(() => ({ message: "Unable to load approvals" })), { status: response.status });
}
