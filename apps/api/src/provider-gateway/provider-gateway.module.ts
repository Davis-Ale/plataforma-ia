import { Module } from "@nestjs/common";
import { AiMeteringModule } from "../ai-metering/ai-metering.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { ObservabilityModule } from "../observability/observability.module";
import { ModelRouter } from "./model-router.service";
import { ProviderGateway } from "./provider-gateway.service";
import { ProviderRegistry } from "./provider-registry.service";

@Module({
  imports: [CapabilitiesModule, AiMeteringModule, ObservabilityModule],
  providers: [ModelRouter, ProviderRegistry, ProviderGateway],
  exports: [ProviderGateway, ModelRouter, ProviderRegistry],
})
export class ProviderGatewayModule {}
