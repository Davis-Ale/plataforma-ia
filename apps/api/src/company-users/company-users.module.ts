import { Module } from "@nestjs/common";
import { DatabaseModule } from "@plataforma/database";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { CompanyUsersController } from "./company-users.controller";
import { CompanyUsersService } from "./company-users.service";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AuditModule,
  ],
  controllers: [CompanyUsersController],
  providers: [CompanyUsersService],
})
export class CompanyUsersModule {}
