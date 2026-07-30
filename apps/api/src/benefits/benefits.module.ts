import { Module } from "@nestjs/common";
import { DatabaseModule } from "@plataforma/database";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { BenefitsController } from "./benefits.controller";
import { BenefitsRepository } from "./benefits.repository";
import { BenefitsService } from "./benefits.service";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AuditModule,
  ],
  controllers: [BenefitsController],
  providers: [
    BenefitsService,
    BenefitsRepository,
  ],
})
export class BenefitsModule {}
