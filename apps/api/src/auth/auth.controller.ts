import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { CurrentCompany } from "./decorators/current-company.decorator";
import { CurrentUser } from "./decorators/current-user.decorator";
import { LoginDto } from "./dto/login.dto";
import { CompanyContextGuard } from "./guards/company-context.guard";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { AuthenticatedCompany } from "./types/authenticated-company";
import { AuthenticatedUser } from "./types/authenticated-user";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  async login(@Body() data: LoginDto) {
    return this.authService.login(data);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }

  @Get("context")
  @UseGuards(JwtAuthGuard, CompanyContextGuard)
  async context(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() company: AuthenticatedCompany,
  ) {
    return { user, company };
  }
}
