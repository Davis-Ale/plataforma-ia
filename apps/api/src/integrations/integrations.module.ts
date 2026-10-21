import { Module } from "@nestjs/common";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import {
  INTEGRATION_BINDING_STORE,
  InMemoryIntegrationBindingStore,
} from "./integration-binding.store";
import { IntegrationBootstrapService } from "./integration-bootstrap.service";
import { IntegrationRegistry } from "./integration-registry.service";
import { IntegrationResolver } from "./integration-resolver.service";

@Module({
  imports: [CapabilitiesModule],
  providers: [
    IntegrationRegistry,
    {
      provide: INTEGRATION_BINDING_STORE,
      useClass: InMemoryIntegrationBindingStore,
    },
    IntegrationResolver,
    IntegrationBootstrapService,
  ],
  exports: [IntegrationRegistry, IntegrationResolver, IntegrationBootstrapService],
})
export class IntegrationsModule {}
