import { Module } from "@nestjs/common";
import { DatabaseModule } from "@plataforma/database";
import { CompaniesController } from "./companies.controller";
import { CompaniesService } from "./companies.service";

@Module({
  imports: [DatabaseModule],
  controllers: [CompaniesController],
  providers: [CompaniesService],
})
export class CompaniesModule {}
