import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthFoundationModule } from "@plataforma/auth";
import { DatabaseModule } from "@plataforma/database";
import { AuthController } from "./auth.controller";
import { AuthSessionService } from "./auth-session.service";
import { AuthTokenService } from "./auth-token.service";
import { AuthService } from "./auth.service";
import { CompanyRolesGuard } from "./guards/company-roles.guard";
import { JwtStrategy } from "./strategies/jwt.strategy";

@Module({
  imports: [
    DatabaseModule,
    AuthFoundationModule,
    PassportModule.register({
      defaultStrategy: "jwt",
    }),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthTokenService,
    AuthSessionService,
    CompanyRolesGuard,
    JwtStrategy,
  ],
  exports: [CompanyRolesGuard],
})
export class AuthModule {}
