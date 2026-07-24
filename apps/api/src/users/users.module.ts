import { Module } from "@nestjs/common";
import { AuthFoundationModule } from "@plataforma/auth";
import { DatabaseModule } from "@plataforma/database";
import { AuthModule } from "../auth/auth.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [
    DatabaseModule,
    AuthFoundationModule,
    AuthModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
