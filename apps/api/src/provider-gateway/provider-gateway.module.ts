import { Module } from "@nestjs/common";
import { AiMeteringModule } from "../ai-metering/ai-metering.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { ObservabilityModule } from "../observability/observability.module";
import { GenerationService } from "./generation.service";
import { ModelRouter } from "./model-router.service";
import { ProviderBootstrapService } from "./provider-bootstrap.service";
import { ProviderGateway } from "./provider-gateway.service";
import { ProviderRegistry } from "./provider-registry.service";

@Module({
  imports: [CapabilitiesModule, AiMeteringModule, ObservabilityModule],
  providers: [ModelRouter, ProviderRegistry, ProviderGateway, ProviderBootstrapService, GenerationService],
  exports: [ProviderGateway, ModelRouter, ProviderRegistry, ProviderBootstrapService, GenerationService],
})
export class ProviderGatewayModule {}
