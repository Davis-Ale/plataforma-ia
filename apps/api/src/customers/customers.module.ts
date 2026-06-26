import { Module } from "@nestjs/common";
import { DatabaseModule } from "@plataforma/database";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";

@Module({
  imports: [DatabaseModule],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
