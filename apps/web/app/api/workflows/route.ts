import { NextRequest, NextResponse } from "next/server";
import { authorizedBackendFetch } from "../../../lib/backend";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId")?.trim();

  if (!companyId) {
    return NextResponse.json(
      { message: "Company is required" },
      { status: 400 },
    );
  }

  const query = new URLSearchParams(request.nextUrl.searchParams);
  query.delete("companyId");
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const response = await authorizedBackendFetch(`/workflows${suffix}`, {
    headers: { "X-Company-Id": companyId },
  });
  const data = await response.json().catch(() => null);

  return NextResponse.json(
    data ?? { message: "Unable to load workflows" },
    { status: response.status },
  );
}
