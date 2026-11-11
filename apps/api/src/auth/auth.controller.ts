import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { AuthService } from "./auth.service";
import { CurrentCompany } from "./decorators/current-company.decorator";
import { CurrentUser } from "./decorators/current-user.decorator";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { CompanyContextGuard } from "./guards/company-context.guard";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { LoginRateLimitService } from "./login-rate-limit.service";
import { AuthenticatedCompany } from "./types/authenticated-company";
import { AuthenticatedUser } from "./types/authenticated-user";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly loginRateLimit: LoginRateLimitService,
  ) {}

  @Post("login")
  async login(@Body() data: LoginDto, @Res({ passthrough: true }) response: Response) {
    const retryAfter = await this.loginRateLimit.retryAfter(data.email);
    if (retryAfter > 0) {
      response.setHeader("Retry-After", retryAfter);
      throw new HttpException("Too many login attempts", HttpStatus.TOO_MANY_REQUESTS);
    }
    return this.authService.login(data);
  }

  @Post("refresh")
  async refresh(@Body() data: RefreshTokenDto) {
    return this.authService.refresh(data);
  }

  @Post("logout")
  async logout(@Body() data: RefreshTokenDto) {
    return this.authService.logout(data);
  }

  @Post("logout-all")
  @UseGuards(JwtAuthGuard)
  async logoutAll(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.logoutAll(user.id);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Get("context")
  @UseGuards(JwtAuthGuard, CompanyContextGuard)
  async context(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() company: AuthenticatedCompany,
  ) {
    return {
      user,
      company,
    };
  }
}
