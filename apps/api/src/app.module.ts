import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "@plataforma/database";
import { CompaniesModule } from "./companies/companies.module";
import { CompanyUsersModule } from "./company-users/company-users.module";
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
  ],
})
export class AppModule {}
