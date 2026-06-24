import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  
  @Get()
  @ApiOperation({ summary: 'Health check da API' })
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      phase: 'Fase 0 - Foundation',
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness check - verifica dependências' })
  ready() {
    // TODO Fase 1: verificar conexão real com banco e Redis
    return {
      status: 'ready',
      checks: {
        database: 'pending', // TODO: implementar
        redis: 'pending',    // TODO: implementar
      },
    };
  }
}
