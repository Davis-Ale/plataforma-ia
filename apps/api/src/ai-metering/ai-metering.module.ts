import { Module } from "@nestjs/common";
import { DatabaseModule } from "@plataforma/database";
import { AiMeteringService } from "./ai-metering.service";

@Module({
  imports: [DatabaseModule],
  providers: [AiMeteringService],
  exports: [AiMeteringService],
})
export class AiMeteringModule {}
