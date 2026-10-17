import type { AuthorizedCapabilityContext, Capability } from "./capability.types";

export const TEXT_SUMMARIZE_CAPABILITY_KEY = "text.summarize";

export type TextSummarizeInput = Readonly<{
  text: string;
}>;

const MAX_TEXT_CHARS = 8_000;

export function isTextSummarizeInput(input: unknown): input is TextSummarizeInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const record = input as Record<string, unknown>;
  if (Object.keys(record).length !== 1) return false;
  if (typeof record.text !== "string") return false;
  const text = record.text.trim();
  return text.length > 0 && text.length <= MAX_TEXT_CHARS;
}

export function createTextSummarizeCapability(): Capability<TextSummarizeInput, Readonly<{ status: string }>> {
  return Object.freeze({
    key: TEXT_SUMMARIZE_CAPABILITY_KEY,
    allowedRoles: Object.freeze(["OWNER", "ADMIN", "MEMBER"] as const),
    approval: Object.freeze({ mode: "NONE" as const }),
    context: Object.freeze({
      maxBytes: 8_192,
      fields: Object.freeze([
        Object.freeze({
          key: "source",
          authorize: (_context: AuthorizedCapabilityContext, input: TextSummarizeInput) =>
            typeof input.text === "string" && input.text.trim().length > 0,
          read: async (context: AuthorizedCapabilityContext, input: TextSummarizeInput) => {
            const text = input.text.trim();
            const summary =
              text.length <= 240 ? text : `${text.slice(0, 237).replace(/[\uD800-\uDBFF]$/, "")}...`;
            return Object.freeze({
              companyId: context.companyId,
              text,
              summary,
            });
          },
        }),
      ]),
    }),
    validate: isTextSummarizeInput,
    authorize: async () => true,
    execute: async () => Object.freeze({ status: "use_provider_gateway_generate" }),
  });
}
