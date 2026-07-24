import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import {
  CompanyStatus,
  CompanyUserStatus,
} from "@prisma/client";
import { AuthenticatedRequest } from "../types/authenticated-request";

@Injectable()
export class CompanyContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request =
      context.switchToHttp().getRequest<AuthenticatedRequest>();

    const rawCompanyId = request.headers["x-company-id"];
    const companyId = Array.isArray(rawCompanyId)
      ? rawCompanyId[0]
      : rawCompanyId;

    if (
      companyId === undefined ||
      companyId.trim() === ""
    ) {
      throw new BadRequestException(
        "X-Company-Id header is required",
      );
    }

    const membership = request.user.companies.find(
      (item) => item.company.id === companyId,
    );

    if (
      membership === undefined ||
      membership.status !== CompanyUserStatus.ACTIVE ||
      membership.company.status !== CompanyStatus.ACTIVE
    ) {
      throw new ForbiddenException(
        "User does not have access to this company",
      );
    }

    request.company = {
      membershipId: membership.id,
      companyId: membership.company.id,
      companyName: membership.company.name,
      companyStatus: membership.company.status,
      role: membership.role,
      membershipStatus: membership.status,
    };

    return true;
  }
}
