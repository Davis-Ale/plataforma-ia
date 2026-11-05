import { Module } from "@nestjs/common";
import { DatabaseModule } from "@plataforma/database";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import {
  INTEGRATION_BINDING_STORE,
} from "./integration-binding.store";
import { IntegrationBootstrapService } from "./integration-bootstrap.service";
import { IntegrationRegistry } from "./integration-registry.service";
import { IntegrationResolver } from "./integration-resolver.service";
import { PrismaIntegrationBindingStore } from "./prisma-integration-binding.store";

@Module({
  imports: [DatabaseModule, CapabilitiesModule],
  providers: [
    IntegrationRegistry,
    {
      provide: INTEGRATION_BINDING_STORE,
      useClass: PrismaIntegrationBindingStore,
    },
    IntegrationResolver,
    IntegrationBootstrapService,
  ],
  exports: [IntegrationRegistry, IntegrationResolver, IntegrationBootstrapService],
})
export class IntegrationsModule {}
