import type { ContextPolicy } from "../context-engine/context.types";

export type CapabilityRole = "OWNER" | "ADMIN" | "MEMBER";

export type ApprovalPurpose = "CONTEXT_PREPARATION" | "GENERATION" | "EXECUTION";

export type CapabilityApprovalRequest = CapabilityRequest & Readonly<{ purpose: ApprovalPurpose }>;

export type CapabilityContext = Readonly<{
  companyId: string;
  userId: string;
  sessionId: string;
  correlationId?: string;
}>;

export type AuthorizedCapabilityContext = CapabilityContext & Readonly<{
  role: CapabilityRole;
}>;

export type CapabilityRequest = Readonly<{
  capability: string;
  input: unknown;
  approvalId?: string;
}>;

export type CapabilityResult<Output = unknown> =
  | { success: true; output: Output }
  | { success: false; error: "APPROVAL_REQUIRED"; approvalId: string }
  | {
      success: false;
      error: "DENIED" | "INVALID_INPUT" | "EXECUTION_FAILED";
    };

export type Capability<Input = unknown, Output = unknown> = Readonly<{
  context?: ContextPolicy<Input>;
  key: string;
  allowedRoles: readonly CapabilityRole[];
  approval?:
    | { mode: "NONE" }
    | { mode: "REQUIRED"; approverRoles: readonly CapabilityRole[] };
  validate: (input: unknown) => input is Input;
  authorize: (
    context: AuthorizedCapabilityContext,
    input: Input,
  ) => boolean | Promise<boolean>;
  execute: (
    context: AuthorizedCapabilityContext,
    input: Input,
  ) => Promise<Output>;
}>;
