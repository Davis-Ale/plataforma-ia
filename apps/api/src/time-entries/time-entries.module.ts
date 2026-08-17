import { Module } from "@nestjs/common";
import { DatabaseModule } from "@plataforma/database";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { TimeEntriesController } from "./time-entries.controller";
import { TimeEntriesRepository } from "./time-entries.repository";
import { TimeEntriesService } from "./time-entries.service";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AuditModule,
  ],
  controllers: [TimeEntriesController],
  providers: [
    TimeEntriesService,
    TimeEntriesRepository,
  ],
})
export class TimeEntriesModule {}
