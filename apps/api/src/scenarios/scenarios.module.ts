import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { WorkflowsModule } from "../workflows/workflows.module";
import { PrepareOperationService } from "./prepare-operation.service";
import { ScenariosController } from "./scenarios.controller";

@Module({
  imports: [AuthModule, CapabilitiesModule, IntegrationsModule, WorkflowsModule],
  controllers: [ScenariosController],
  providers: [PrepareOperationService],
  exports: [PrepareOperationService],
})
export class ScenariosModule {}
