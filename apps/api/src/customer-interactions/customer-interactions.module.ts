import { Module } from "@nestjs/common";
import { DatabaseModule } from "@plataforma/database";
import { AuditModule } from "../audit/audit.module";
import { CompanyCustomerInteractionsController, CustomerInteractionsController } from "./customer-interactions.controller";
import { CustomerInteractionsService } from "./customer-interactions.service";

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [CustomerInteractionsController, CompanyCustomerInteractionsController],
  providers: [CustomerInteractionsService],
})
export class CustomerInteractionsModule {}
