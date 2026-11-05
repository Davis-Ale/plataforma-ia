import { Module } from "@nestjs/common";
import { WorkflowsModule as WorkflowsFoundationModule } from "@plataforma/workflows";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { WorkflowsController } from "./workflows.controller";
import { WorkflowsService } from "./workflows.service";

@Module({
  imports: [
    WorkflowsFoundationModule,
    AuditModule,
    AuthModule,
  ],
  controllers: [WorkflowsController],
  providers: [WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
