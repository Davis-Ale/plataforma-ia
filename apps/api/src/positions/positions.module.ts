import { Module } from "@nestjs/common";
import { DatabaseModule } from "@plataforma/database";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { PositionsController } from "./positions.controller";
import { PositionsRepository } from "./positions.repository";
import { PositionsService } from "./positions.service";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AuditModule,
  ],
  controllers: [PositionsController],
  providers: [
    PositionsService,
    PositionsRepository,
  ],
})
export class PositionsModule {}
