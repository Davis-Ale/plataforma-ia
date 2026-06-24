import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    // Configuração global de ambiente
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    
    // Health check - Fase 0
    HealthModule,
    
    // TODO Fase 1: AuthModule, DatabaseModule
    // TODO Fase 2: AuditModule, QueuesModule
    // TODO Fase 3: EmployeesModule, BenefitsModule, etc.
    // TODO Fase 6: AiModule
  ],
})
export class AppModule {}
