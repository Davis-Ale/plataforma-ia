import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { ProcessObservabilityService } from "./process-observability.service";

@Module({
  imports: [AuditModule],
  providers: [ProcessObservabilityService],
  exports: [ProcessObservabilityService],
})
export class ObservabilityModule {}
