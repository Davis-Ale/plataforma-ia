import { NextResponse } from "next/server";
import { authorizedBackendFetch } from "../../../../lib/backend";

export async function GET() {
  const response = await authorizedBackendFetch("/auth/me");
  const data = await response.json().catch(() => null);

  return NextResponse.json(
    data ?? { message: "Unauthorized" },
    { status: response.status },
  );
}
