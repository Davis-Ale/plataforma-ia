import {
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditAction,
  CompanyUserRole,
  RequestStatus,
} from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedCompany } from "../auth/types/authenticated-company";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateRequestDto } from "./dto/create-request.dto";
import { FindRequestsQueryDto } from "./dto/find-requests-query.dto";
import { UpdateRequestDto } from "./dto/update-request.dto";
import { RequestsRepository } from "./requests.repository";

@Injectable()
export class RequestsService {
  constructor(
    private readonly requestsRepository: RequestsRepository,
    private readonly auditService: AuditService,
  ) {}

  async create(
    company: AuthenticatedCompany,
    user: AuthenticatedUser,
    data: CreateRequestDto,
  ) {
    const request =
      await this.requestsRepository.create(
        company.companyId,
        {
          createdByUserId: user.id,
          title: data.title,
          description: data.description,
          status: RequestStatus.OPEN,
        },
      );

    await this.auditService.create({
      companyId: company.companyId,
      userId: user.id,
      action: AuditAction.CREATE,
      resource: "request",
      resourceId: request.id,
      metadata: {
        title: request.title,
        status: request.status,
      },
    });

    return request;
  }

  async findAll(
    company: AuthenticatedCompany,
    user: AuthenticatedUser,
    query: FindRequestsQueryDto,
  ) {
    const page = this.toPositiveNumber(
      query.page,
      1,
    );
    const requestedLimit = this.toPositiveNumber(
      query.limit,
      20,
    );
    const limit = Math.min(requestedLimit, 100);
    const skip = (page - 1) * limit;

    const [items, total] =
      await this.requestsRepository.findMany(
        company.companyId,
        query,
        skip,
        limit,
        this.getAuthorFilter(company, user),
      );

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(
    company: AuthenticatedCompany,
    user: AuthenticatedUser,
    id: string,
  ) {
    const request =
      await this.requestsRepository.findOne(
        company.companyId,
        id,
        this.getAuthorFilter(company, user),
      );

    if (request === null) {
      throw new NotFoundException(
        "Request not found",
      );
    }

    return request;
  }

  async update(
    company: AuthenticatedCompany,
    user: AuthenticatedUser,
    id: string,
    data: UpdateRequestDto,
  ) {
    await this.findOne(company, user, id);

    const result =
      await this.requestsRepository.update(
        company.companyId,
        id,
        {
          status: data.status,
        },
      );

    if (result.count === 0) {
      throw new NotFoundException(
        "Request not found",
      );
    }

    const request = await this.findOne(
      company,
      user,
      id,
    );

    await this.auditService.create({
      companyId: company.companyId,
      userId: user.id,
      action: AuditAction.UPDATE,
      resource: "request",
      resourceId: request.id,
      metadata: {
        changedFields: Object.keys(data).filter(
          (key) =>
            data[key as keyof UpdateRequestDto] !==
            undefined,
        ),
      },
    });

    return request;
  }

  private isElevatedRole(
    company: AuthenticatedCompany,
  ) {
    return (
      company.role === CompanyUserRole.OWNER ||
      company.role === CompanyUserRole.ADMIN
    );
  }

  private getAuthorFilter(
    company: AuthenticatedCompany,
    user: AuthenticatedUser,
  ) {
    if (this.isElevatedRole(company)) {
      return undefined;
    }

    return user.id;
  }

  private toPositiveNumber(
    value: string | undefined,
    fallback: number,
  ) {
    if (value === undefined) {
      return fallback;
    }

    const parsed = Number(value);

    if (
      Number.isNaN(parsed) ||
      parsed < 1
    ) {
      return fallback;
    }

    return Math.floor(parsed);
  }
}
