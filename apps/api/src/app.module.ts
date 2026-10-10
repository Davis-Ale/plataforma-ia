import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "@plataforma/database";
import { AuthModule } from "./auth/auth.module";
import { AuditModule } from "./audit/audit.module";
import { BenefitsModule } from "./benefits/benefits.module";
import { CompaniesModule } from "./companies/companies.module";
import { CompanyUsersModule } from "./company-users/company-users.module";
import { ContractsModule } from "./contracts/contracts.module";
import { CustomerInteractionsModule } from "./customer-interactions/customer-interactions.module";
import { CustomersModule } from "./customers/customers.module";
import { DepartmentsModule } from "./departments/departments.module";
import { EmployeesModule } from "./employees/employees.module";
import { HealthModule } from "./health/health.module";
import { PositionsModule } from "./positions/positions.module";
import { QueuesModule } from "./queues/queues.module";
import { TimeEntriesModule } from "./time-entries/time-entries.module";
import { AbsencesModule } from "./absences/absences.module";
import { RequestsModule } from "./requests/requests.module";
import { UsersModule } from "./users/users.module";
import { WorkflowsModule } from "./workflows/workflows.module";
import { CapabilitiesModule } from "./capabilities/capabilities.module";
import { AiMeteringModule } from "./ai-metering/ai-metering.module";
import { ProviderGatewayModule } from "./provider-gateway/provider-gateway.module";

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
    CustomerInteractionsModule,
    QueuesModule,
    DepartmentsModule,
    PositionsModule,
    EmployeesModule,
    ContractsModule,
    BenefitsModule,
    TimeEntriesModule,
    AbsencesModule,
    RequestsModule,
    WorkflowsModule,
    CapabilitiesModule,
    AiMeteringModule,
    ProviderGatewayModule,
  ],
})
export class AppModule {}
