import { Module } from "@nestjs/common";
import { WorkflowsModule as WorkflowsFoundationModule } from "@plataforma/workflows";
import { AuditModule } from "../audit/audit.module";
import { WorkflowsService } from "./workflows.service";

@Module({
  imports: [
    WorkflowsFoundationModule,
    AuditModule,
  ],
  providers: [WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
