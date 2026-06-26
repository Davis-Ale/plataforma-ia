import { Injectable, NotFoundException } from "@nestjs/common";
import { CustomerStatus, Prisma } from "@prisma/client";
import { PrismaService } from "@plataforma/database";
import { AuthenticatedCompany } from "../auth/types/authenticated-company";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { FindCustomersQueryDto } from "./dto/find-customers-query.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(company: AuthenticatedCompany, data: CreateCustomerDto) {
    return this.prisma.customer.create({
      data: {
        companyId: company.companyId,
        name: data.name,
        email: data.email,
        phone: data.phone,
        document: data.document,
      },
    });
  }

  async findAll(company: AuthenticatedCompany, query: FindCustomersQueryDto) {
    const page = this.toPositiveNumber(query.page, 1);
    const limit = this.toPositiveNumber(query.limit, 20);
    const safeLimit = Math.min(limit, 100);
    const skip = (page - 1) * safeLimit;

    const where: Prisma.CustomerWhereInput = {
      companyId: company.companyId,
      status: {
        not: CustomerStatus.ARCHIVED,
      },
    };

    if (query.search !== undefined && query.search.trim() !== "") {
      const search = query.search.trim();

      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { document: { contains: search, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: safeLimit,
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async findOne(company: AuthenticatedCompany, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id,
        companyId: company.companyId,
      },
    });

    if (customer === null) {
      throw new NotFoundException("Customer not found");
    }

    return customer;
  }

  async update(company: AuthenticatedCompany, id: string, data: UpdateCustomerDto) {
    const result = await this.prisma.customer.updateMany({
      where: {
        id,
        companyId: company.companyId,
      },
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        document: data.document,
        status: data.status,
      },
    });

    if (result.count === 0) {
      throw new NotFoundException("Customer not found");
    }

    return this.findOne(company, id);
  }

  async archive(company: AuthenticatedCompany, id: string) {
    const result = await this.prisma.customer.updateMany({
      where: {
        id,
        companyId: company.companyId,
      },
      data: {
        status: CustomerStatus.ARCHIVED,
      },
    });

    if (result.count === 0) {
      throw new NotFoundException("Customer not found");
    }

    return this.findOne(company, id);
  }

  private toPositiveNumber(value: string | undefined, fallback: number) {
    if (value === undefined) {
      return fallback;
    }

    const parsed = Number(value);

    if (Number.isNaN(parsed) || parsed < 1) {
      return fallback;
    }

    return Math.floor(parsed);
  }
}
