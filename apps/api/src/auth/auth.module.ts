import { Module } from "@nestjs/common";
import { AuthFoundationModule } from "@plataforma/auth";
import { DatabaseModule } from "@plataforma/database";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Module({
  imports: [DatabaseModule, AuthFoundationModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
