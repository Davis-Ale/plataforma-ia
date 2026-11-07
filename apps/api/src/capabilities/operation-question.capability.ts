import type { AuthorizedCapabilityContext, Capability } from "./capability.types";

export const OPERATION_QUESTION_CAPABILITY = "operations.question.interpret";
export const OPERATION_QUESTION_MAX_LENGTH = 300;

type OperationQuestionInput = Readonly<{ question: string }>;

export function createOperationQuestionCapability(): Capability<OperationQuestionInput> {
  return {
    key: OPERATION_QUESTION_CAPABILITY,
    allowedRoles: ["OWNER", "ADMIN", "MEMBER"],
    approval: { mode: "NONE" },
    validate: (input): input is OperationQuestionInput => {
      if (!input || typeof input !== "object" || Array.isArray(input)) return false;
      const record = input as Record<string, unknown>;
      return Object.keys(record).length === 1 && typeof record.question === "string" &&
        record.question.trim().length > 0 && record.question.length <= OPERATION_QUESTION_MAX_LENGTH;
    },
    authorize: async () => true,
    context: {
      maxBytes: 4096,
      fields: [{
        key: "question",
        authorize: () => true,
        read: async (context: AuthorizedCapabilityContext, input: OperationQuestionInput) => ({
          companyId: context.companyId,
          text: input.question,
        }),
      }],
    },
    execute: async () => ({ status: "use_provider_gateway_generate" }),
  };
}
