import { Module } from "@nestjs/common";
import { DatabaseModule } from "@plataforma/database";
import { AuditService } from "./audit.service";

@Module({
  imports: [DatabaseModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
