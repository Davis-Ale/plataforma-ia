import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { CanActivate, ExecutionContext } from "@nestjs/common";
import { AuthenticatedRequest } from "../types/authenticated-request";

@Injectable()
export class CompanyContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const rawCompanyId = request.headers["x-company-id"];
    const companyId = Array.isArray(rawCompanyId) ? rawCompanyId[0] : rawCompanyId;

    if (companyId === undefined || companyId.trim() === "") {
      throw new BadRequestException("X-Company-Id header is required");
    }

    const membership = request.user.companies.find((item) => item.company.id === companyId);

    if (membership === undefined) {
      throw new ForbiddenException("User does not have access to this company");
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
