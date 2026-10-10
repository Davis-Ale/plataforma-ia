import { Injectable } from "@nestjs/common";
import { AuditAction } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { buildProcessObservation } from "./process-observation";
import { ProcessObservationInput } from "./process-observation.types";

@Injectable()
export class ProcessObservabilityService {
  constructor(private readonly audit: AuditService) {}

  async record(input: ProcessObservationInput) {
    const observation = buildProcessObservation(input);
    await this.audit.create({
      companyId: input.companyId,
      action: AuditAction.CREATE,
      resource: "process_execution",
      resourceId: observation.correlationId,
      metadata: { observation },
    });
    return observation;
  }
}
