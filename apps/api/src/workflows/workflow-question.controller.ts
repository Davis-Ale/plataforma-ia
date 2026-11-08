import { BadRequestException, Body, Controller, ForbiddenException, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { IsString, MaxLength } from "class-validator";
import { randomUUID } from "node:crypto";
import { CurrentCompany } from "../auth/decorators/current-company.decorator";
import { CurrentSession } from "../auth/decorators/current-session.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CompanyContextGuard } from "../auth/guards/company-context.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthenticatedCompany } from "../auth/types/authenticated-company";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { AuthorizationGateway } from "../capabilities/authorization-gateway.service";
import { OPERATION_QUESTION_CAPABILITY, OPERATION_QUESTION_MAX_LENGTH } from "../capabilities/operation-question.capability";
import { GenerationService } from "../provider-gateway/generation.service";
import { WorkflowsService } from "./workflows.service";

export class AskWorkflowQuestionDto {
  @IsString()
  @MaxLength(OPERATION_QUESTION_MAX_LENGTH)
  declare question: string;
}

@Controller("workflows")
@UseGuards(JwtAuthGuard, CompanyContextGuard)
export class WorkflowQuestionController {
  constructor(
    private readonly workflows: WorkflowsService,
    private readonly authorization: AuthorizationGateway,
    private readonly generation: GenerationService,
  ) {}

  @Post(":id/question")
  @HttpCode(200)
  async ask(
    @CurrentCompany() company: AuthenticatedCompany,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSession() sessionId: string | undefined,
    @Param("id") id: string,
    @Body() body: AskWorkflowQuestionDto,
  ) {
    const question = body.question.trim();
    if (!question) throw new BadRequestException("Question is required");
    const context = { companyId: company.companyId, userId: user.id, sessionId: sessionId ?? "" };
    const request = { capability: OPERATION_QUESTION_CAPABILITY, input: { question } };
    if (!await this.authorization.canAccessCheckpoint(context, request)) throw new ForbiddenException();
    await this.workflows.findOne(company.companyId, id);

    const interpreted = await this.generation.generate(context, { ...request, operationId: randomUUID(), attemptNumber: 1 });
    if (!interpreted.success) return { success: false, error: interpreted.error };
    if (interpreted.companyId !== company.companyId) throw new ForbiddenException();
    if (interpreted.output.trim() !== "STATUS") return { success: false, error: "UNSUPPORTED_QUESTION" };
    if (!await this.authorization.canAccessCheckpoint(context, request)) throw new ForbiddenException();

    const run = await this.workflows.findOne(company.companyId, id);
    const error = run.error === "APPROVAL_REQUIRED" || run.error === "APPROVAL_REJECTED" ? run.error : null;
    return { success: true, operationId: run.operationId, status: run.status, error, updatedAt: run.updatedAt };
  }
}
