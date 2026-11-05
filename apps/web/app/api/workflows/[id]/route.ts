import { NextRequest, NextResponse } from "next/server";
import { authorizedBackendFetch } from "../../../../lib/backend";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const companyId = request.nextUrl.searchParams.get("companyId")?.trim();

  if (!companyId) {
    return NextResponse.json(
      { message: "Company is required" },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const response = await authorizedBackendFetch(
    `/workflows/${encodeURIComponent(id)}`,
    { headers: { "X-Company-Id": companyId } },
  );
  const data = await response.json().catch(() => null);

  return NextResponse.json(
    data ?? { message: "Unable to load workflow" },
    { status: response.status },
  );
}
