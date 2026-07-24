import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditAction } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedCompany } from "../auth/types/authenticated-company";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreatePositionDto } from "./dto/create-position.dto";
import { UpdatePositionDto } from "./dto/update-position.dto";
import { PositionsRepository } from "./positions.repository";

@Injectable()
export class PositionsService {
  constructor(
    private readonly positionsRepository: PositionsRepository,
    private readonly auditService: AuditService,
  ) {}

  async create(
    company: AuthenticatedCompany,
    user: AuthenticatedUser,
    data: CreatePositionDto,
  ) {
    const position = await this.createPosition(
      company.companyId,
      data,
    );

    await this.auditService.create({
      companyId: company.companyId,
      userId: user.id,
      action: AuditAction.CREATE,
      resource: "position",
      resourceId: position.id,
      metadata: {
        name: position.name,
      },
    });

    return position;
  }

  findAll(company: AuthenticatedCompany) {
    return this.positionsRepository.findAll(
      company.companyId,
    );
  }

  async findOne(
    company: AuthenticatedCompany,
    id: string,
  ) {
    const position =
      await this.positionsRepository.findOne(
        company.companyId,
        id,
      );

    if (position === null) {
      throw new NotFoundException(
        "Position not found",
      );
    }

    return position;
  }

  async update(
    company: AuthenticatedCompany,
    user: AuthenticatedUser,
    id: string,
    data: UpdatePositionDto,
  ) {
    await this.updatePosition(
      company.companyId,
      id,
      data,
    );

    const position = await this.findOne(
      company,
      id,
    );

    await this.auditService.create({
      companyId: company.companyId,
      userId: user.id,
      action: AuditAction.UPDATE,
      resource: "position",
      resourceId: position.id,
      metadata: {
        changedFields: Object.keys(data).filter(
          (key) =>
            data[key as keyof UpdatePositionDto] !==
            undefined,
        ),
      },
    });

    return position;
  }

  async remove(
    company: AuthenticatedCompany,
    user: AuthenticatedUser,
    id: string,
  ) {
    const position = await this.findOne(
      company,
      id,
    );

    await this.positionsRepository.remove(
      company.companyId,
      id,
    );

    await this.auditService.create({
      companyId: company.companyId,
      userId: user.id,
      action: AuditAction.DELETE,
      resource: "position",
      resourceId: position.id,
      metadata: {
        name: position.name,
      },
    });

    return {
      deleted: true,
      id: position.id,
    };
  }

  private async createPosition(
    companyId: string,
    data: CreatePositionDto,
  ) {
    try {
      return await this.positionsRepository.create(
        companyId,
        {
          name: data.name.trim(),
          description: data.description?.trim(),
        },
      );
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  private async updatePosition(
    companyId: string,
    id: string,
    data: UpdatePositionDto,
  ) {
    try {
      const result =
        await this.positionsRepository.update(
          companyId,
          id,
          {
            name: data.name?.trim(),
            description: data.description?.trim(),
          },
        );

      if (result.count === 0) {
        throw new NotFoundException(
          "Position not found",
        );
      }
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  private handleDatabaseError(error: unknown): never {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new BadRequestException(
        "Position name already exists",
      );
    }

    throw error;
  }
}
