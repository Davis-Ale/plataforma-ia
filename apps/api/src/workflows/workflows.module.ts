import { Module } from "@nestjs/common";
import { WorkflowsModule as WorkflowsFoundationModule } from "@plataforma/workflows";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { ProviderGatewayModule } from "../provider-gateway/provider-gateway.module";
import { WorkflowQuestionController } from "./workflow-question.controller";
import { WorkflowsController } from "./workflows.controller";
import { WorkflowsService } from "./workflows.service";

@Module({
  imports: [
    WorkflowsFoundationModule,
    AuditModule,
    AuthModule,
    CapabilitiesModule,
    ProviderGatewayModule,
  ],
  controllers: [WorkflowsController, WorkflowQuestionController],
  providers: [WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
