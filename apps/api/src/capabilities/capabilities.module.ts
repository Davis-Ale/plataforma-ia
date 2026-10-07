import { Module } from "@nestjs/common";
import { DatabaseModule } from "@plataforma/database";
import { AuthorizationGateway } from "./authorization-gateway.service";
import { CapabilityRegistry } from "./capability-registry.service";
import { HumanApprovalService } from "./human-approval.service";

@Module({
  imports: [DatabaseModule],
  providers: [CapabilityRegistry, AuthorizationGateway, HumanApprovalService],
  exports: [CapabilityRegistry, AuthorizationGateway, HumanApprovalService],
})
export class CapabilitiesModule {}
