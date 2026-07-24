import {
  Injectable,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@plataforma/database";
import Redis from "ioredis";

type ServiceStatus = "up" | "down";

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.redis = new Redis({
      host:
        configService.get<string>("REDIS_HOST") ??
        "localhost",
      port: Number(
        configService.get<string>("REDIS_PORT") ??
          "6380",
      ),
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
  }

  async check() {
    const [databaseResult, redisResult] =
      await Promise.allSettled([
        this.prisma.$queryRaw`SELECT 1`,
        this.redis.ping(),
      ]);

    const database: ServiceStatus =
      databaseResult.status === "fulfilled"
        ? "up"
        : "down";

    const redis: ServiceStatus =
      redisResult.status === "fulfilled" &&
      redisResult.value === "PONG"
        ? "up"
        : "down";

    return {
      status:
        database === "up" && redis === "up"
          ? "ok"
          : "degraded",
      services: {
        database,
        redis,
      },
      timestamp: new Date().toISOString(),
    };
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }
}
