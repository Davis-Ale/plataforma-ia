import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { CompanyUserRole } from "@prisma/client";
import { Reflector } from "@nestjs/core";
import { COMPANY_ROLES_KEY } from "../decorators/company-roles.decorator";
import { AuthenticatedRequest } from "../types/authenticated-request";

@Injectable()
export class CompanyRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const requiredRoles = this.reflector.getAllAndOverride<CompanyUserRole[]>(
      COMPANY_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredRoles === undefined || requiredRoles.length === 0) {
      return true;
    }

    const request =
      context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (request.company === undefined) {
      throw new ForbiddenException("Company context is required");
    }

    if (requiredRoles.includes(request.company.role) === false) {
      throw new ForbiddenException(
        "User does not have permission for this action",
      );
    }

    return true;
  }
}
