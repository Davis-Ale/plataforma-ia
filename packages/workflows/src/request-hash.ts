import { createHash } from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value === undefined ? null : value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  const record = value as Record<string, unknown>;
  const canonical: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    canonical[key] = canonicalize(record[key]);
  }
  return canonical;
}

export function hashWorkflowRequest(
  workflowKey: string,
  input?: unknown,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        workflowKey,
        input: canonicalize(input ?? null),
      }),
    )
    .digest("hex");
}
