import { Module } from "@nestjs/common";
import { DatabaseModule } from "@plataforma/database";
import { AuditModule } from "../audit/audit.module";
import { CustomerInteractionsController } from "./customer-interactions.controller";
import { CustomerInteractionsService } from "./customer-interactions.service";

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [CustomerInteractionsController],
  providers: [CustomerInteractionsService],
})
export class CustomerInteractionsModule {}
