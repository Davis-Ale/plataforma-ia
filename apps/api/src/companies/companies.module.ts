import { Module } from "@nestjs/common";
import { DatabaseModule } from "@plataforma/database";
import { AuthModule } from "../auth/auth.module";
import { CompaniesController } from "./companies.controller";
import { CompaniesService } from "./companies.service";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
  ],
  controllers: [CompaniesController],
  providers: [CompaniesService],
})
export class CompaniesModule {}
