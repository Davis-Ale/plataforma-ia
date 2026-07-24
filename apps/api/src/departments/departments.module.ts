import { Module } from "@nestjs/common";
import { DatabaseModule } from "@plataforma/database";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { DepartmentsController } from "./departments.controller";
import { DepartmentsService } from "./departments.service";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AuditModule,
  ],
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
})
export class DepartmentsModule {}
