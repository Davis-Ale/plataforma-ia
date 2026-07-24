import {
  CompanyStatus,
  CompanyUserRole,
  CompanyUserStatus,
} from "@prisma/client";

export type AuthenticatedCompany = {
  membershipId: string;
  companyId: string;
  companyName: string;
  companyStatus: CompanyStatus;
  role: CompanyUserRole;
  membershipStatus: CompanyUserStatus;
};
