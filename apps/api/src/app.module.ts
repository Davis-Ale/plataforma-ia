import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "@plataforma/database";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    // Configuração global de ambiente
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: "../../.env",
    }),

    // Banco de dados - Prisma
    DatabaseModule,

    // Health check - Fase 0
    HealthModule,

    // TODO Fase 1: AuthModule
    // TODO Fase 2: AuditModule, QueuesModule
    // TODO Fase 3: EmployeesModule, BenefitsModule, etc.
    // TODO Fase 6: AiModule
  ],
})
export class AppModule {}
