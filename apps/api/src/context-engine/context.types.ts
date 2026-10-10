import type { AuthorizedCapabilityContext, CapabilityRequest } from "../capabilities/capability.types";

export type ContextField<Input> = Readonly<{
  key: string;
  authorize: (context: AuthorizedCapabilityContext, input: Input) => boolean | Promise<boolean>;
  read: (context: AuthorizedCapabilityContext, input: Input) => Promise<Readonly<{
    companyId: string;
    text: string;
    summary?: string;
  }>>;
}>;

export type ContextPolicy<Input> = Readonly<{
  maxBytes: number;
  fields: readonly ContextField<Input>[];
}>;

export type ContextRequest = CapabilityRequest & Readonly<{ maxBytes?: number }>;

export type PreparedContext = Readonly<{
  companyId: string;
  capability: string;
  correlationId: string;
  content: string;
  sizeBytes: number;
  reduced: boolean;
}>;
