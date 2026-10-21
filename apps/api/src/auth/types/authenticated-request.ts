import { AuthenticatedCompany } from "./authenticated-company";
import { AuthenticatedUser } from "./authenticated-user";

export type AuthenticatedRequest = {
  user: AuthenticatedUser;
  company?: AuthenticatedCompany;
  sessionId?: string;
  headers: Record<string, string | string[] | undefined>;
};
