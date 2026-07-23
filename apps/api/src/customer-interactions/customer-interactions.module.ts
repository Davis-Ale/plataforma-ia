import { Module } from "@nestjs/common";
import { DatabaseModule } from "@plataforma/database";
import { AuditModule } from "../audit/audit.module";
import {
  CompanyCustomerInteractionsController,
  CustomerInteractionsController,
} from "./customer-interactions.controller";
import { CustomerInteractionsSummaryService } from "./customer-interactions-summary.service";
import { CustomerInteractionsService } from "./customer-interactions.service";

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [
    CustomerInteractionsController,
    CompanyCustomerInteractionsController,
  ],
  providers: [
    CustomerInteractionsService,
    CustomerInteractionsSummaryService,
  ],
})
export class CustomerInteractionsModule {}
