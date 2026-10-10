import type { AuthorizedCapabilityContext } from "../capabilities/capability.types";
import type { ContextPolicy, PreparedContext } from "./context.types";

export const MAX_CONTEXT_BYTES = 16_384;
export const MAX_CONTEXT_FIELDS = 16;

export function snapshotContextPolicy<Input>(policy: ContextPolicy<Input>): ContextPolicy<Input> {
  if (!policy || !Number.isSafeInteger(policy.maxBytes) || policy.maxBytes < 2 ||
    policy.maxBytes > MAX_CONTEXT_BYTES || !Array.isArray(policy.fields) ||
    policy.fields.length > MAX_CONTEXT_FIELDS ||
    new Set(policy.fields.map((field) => field?.key)).size !== policy.fields.length ||
    policy.fields.some((field) => !field || typeof field.key !== "string" ||
      !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(field.key) ||
      typeof field.authorize !== "function" || typeof field.read !== "function")) {
    throw new Error("Invalid context policy");
  }
  return Object.freeze({ maxBytes: policy.maxBytes,
    fields: Object.freeze(policy.fields.map(({ key, authorize, read }) => Object.freeze({ key, authorize, read }))),
  });
}

export async function prepareContext<Input>(
  context: AuthorizedCapabilityContext,
  capability: string,
  input: Input,
  policy: ContextPolicy<Input>,
  requestedMaxBytes?: number,
): Promise<PreparedContext> {
  if (!context.companyId?.trim() || !context.correlationId?.trim() ||
    (requestedMaxBytes !== undefined && (!Number.isSafeInteger(requestedMaxBytes) || requestedMaxBytes < 2))) {
    throw new Error("Invalid context request");
  }
  const limit = Math.min(policy.maxBytes, requestedMaxBytes ?? policy.maxBytes, MAX_CONTEXT_BYTES);
  const entries: { key: string; text: string; representation: "FULL" | "SUMMARY" | "TRUNCATED" }[] = [];
  const size = () => Buffer.byteLength(JSON.stringify(entries), "utf8");
  let reduced = false;
  for (const field of policy.fields) {
    if (size() >= limit) { reduced = true; break; }
    if (await field.authorize(context, input) !== true) continue;
    const value = await field.read(context, input);
    if (!value || value.companyId !== context.companyId || typeof value.text !== "string" ||
      (value.summary !== undefined && typeof value.summary !== "string")) {
      throw new Error("Invalid context source");
    }
    const entry = { key: field.key, text: value.text, representation: "FULL" as "FULL" | "SUMMARY" | "TRUNCATED" };
    entries.push(entry);
    if (size() <= limit) continue;
    reduced = true;
    if (value.summary !== undefined) {
      entry.text = value.summary;
      entry.representation = "SUMMARY";
      if (size() <= limit) continue;
    }
    entry.representation = "TRUNCATED";
    const original = entry.text;
    entry.text = "";
    if (size() > limit) { entries.pop(); break; }
    let low = 0;
    let high = Math.min(original.length, limit);
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      entry.text = original.slice(0, middle);
      if (size() <= limit) low = middle;
      else high = middle - 1;
    }
    entry.text = original.slice(0, low).replace(/[\uD800-\uDBFF]$/, "");
    break;
  }
  const content = JSON.stringify(entries);
  return Object.freeze({ companyId: context.companyId, capability,
    correlationId: context.correlationId, content,
    sizeBytes: Buffer.byteLength(content, "utf8"), reduced });
}
