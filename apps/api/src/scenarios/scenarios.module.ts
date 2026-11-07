import { Module } from "@nestjs/common";
import { DatabaseModule } from "@plataforma/database";
import { AuthModule } from "../auth/auth.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { WorkflowsModule } from "../workflows/workflows.module";
import { PrepareOperationService } from "./prepare-operation.service";
import { ScenariosController } from "./scenarios.controller";
import { ExecutionIntegrityService } from "./execution-integrity.service";
import { ExecutionRecoveryController } from "./execution-recovery.controller";
import { WorkflowApprovalService } from "./workflow-approval.service";
import { WorkflowApprovalController } from "./workflow-approval.controller";

@Module({
  imports: [DatabaseModule, AuthModule, CapabilitiesModule, IntegrationsModule, WorkflowsModule],
  controllers: [ScenariosController, ExecutionRecoveryController, WorkflowApprovalController],
  providers: [PrepareOperationService, ExecutionIntegrityService, WorkflowApprovalService],
  exports: [PrepareOperationService],
})
export class ScenariosModule {}
