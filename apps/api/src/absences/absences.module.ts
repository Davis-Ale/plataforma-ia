import { Module } from "@nestjs/common";
import { DatabaseModule } from "@plataforma/database";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { AbsencesController } from "./absences.controller";
import { AbsencesRepository } from "./absences.repository";
import { AbsencesService } from "./absences.service";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AuditModule,
  ],
  controllers: [AbsencesController],
  providers: [
    AbsencesService,
    AbsencesRepository,
  ],
})
export class AbsencesModule {}
