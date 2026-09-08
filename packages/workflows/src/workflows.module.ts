import { Module } from "@nestjs/common";
import { DatabaseModule } from "@plataforma/database";
import { WorkflowsRepository } from "./workflows.repository";
import { WorkflowsService } from "./workflows.service";

@Module({
  imports: [DatabaseModule],
  providers: [WorkflowsRepository, WorkflowsService],
  exports: [WorkflowsService, WorkflowsRepository],
})
export class WorkflowsModule {}
