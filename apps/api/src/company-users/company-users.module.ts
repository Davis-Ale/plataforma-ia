import { Module } from "@nestjs/common";
import { DatabaseModule } from "@plataforma/database";
import { CompanyUsersController } from "./company-users.controller";
import { CompanyUsersService } from "./company-users.service";

@Module({
  imports: [DatabaseModule],
  controllers: [CompanyUsersController],
  providers: [CompanyUsersService],
})
export class CompanyUsersModule {}
