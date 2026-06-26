import { AuthenticatedCompany } from "./authenticated-company";
import { AuthenticatedUser } from "./authenticated-user";

export type AuthenticatedRequest = {
  user: AuthenticatedUser;
  company?: AuthenticatedCompany;
  headers: Record<string, string | string[] | undefined>;
};
