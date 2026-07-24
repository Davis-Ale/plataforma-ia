import {
  CompanyStatus,
  CompanyUserRole,
  CompanyUserStatus,
  UserStatus,
} from "@prisma/client";

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  status: UserStatus;
  companies: Array<{
    id: string;
    role: CompanyUserRole;
    status: CompanyUserStatus;
    company: {
      id: string;
      name: string;
      status: CompanyStatus;
    };
  }>;
};
