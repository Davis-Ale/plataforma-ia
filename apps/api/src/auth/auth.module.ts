import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthFoundationModule } from "@plataforma/auth";
import { DatabaseModule } from "@plataforma/database";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Module({
  imports: [
    DatabaseModule,
    AuthFoundationModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "local-development-jwt-secret-change-me",
      signOptions: {
        expiresIn: "1h",
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
