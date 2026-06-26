import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "@plataforma/database";
import { AuthModule } from "./auth/auth.module";
import { AuditModule } from "./audit/audit.module";
import { CompaniesModule } from "./companies/companies.module";
import { CompanyUsersModule } from "./company-users/company-users.module";
import { CustomersModule } from "./customers/customers.module";
import { HealthModule } from "./health/health.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: "../../.env",
    }),
    DatabaseModule,
    HealthModule,
    CompaniesModule,
    UsersModule,
    CompanyUsersModule,
    AuthModule,
    AuditModule,
    CustomersModule,
  ],
})
export class AppModule {}
