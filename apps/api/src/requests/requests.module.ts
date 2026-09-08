import { Module } from "@nestjs/common";
import { DatabaseModule } from "@plataforma/database";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { RequestsController } from "./requests.controller";
import { RequestsRepository } from "./requests.repository";
import { RequestsService } from "./requests.service";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AuditModule,
  ],
  controllers: [RequestsController],
  providers: [
    RequestsService,
    RequestsRepository,
  ],
})
export class RequestsModule {}
