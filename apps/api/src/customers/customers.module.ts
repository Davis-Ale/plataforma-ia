import { Module } from "@nestjs/common";
import { DatabaseModule } from "@plataforma/database";
import { AuditModule } from "../audit/audit.module";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
