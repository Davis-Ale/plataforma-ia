import { Module } from "@nestjs/common";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { WorkflowsModule } from "../workflows/workflows.module";
import { PrepareOperationService } from "./prepare-operation.service";

@Module({
  imports: [CapabilitiesModule, IntegrationsModule, WorkflowsModule],
  providers: [PrepareOperationService],
  exports: [PrepareOperationService],
})
export class ScenariosModule {}
