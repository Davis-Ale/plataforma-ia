import { Injectable, OnModuleDestroy, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac } from "node:crypto";
import Redis from "ioredis";

const MAX_ATTEMPTS = 10;
const WINDOW_SECONDS = 60;
const RECORD_ATTEMPT = `
local attempts = redis.call("INCR", KEYS[1])
if attempts == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[2])
end
if attempts > tonumber(ARGV[1]) then
  return math.max(1, redis.call("TTL", KEYS[1]))
end
return 0
`;

@Injectable()
export class LoginRateLimitService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.secret = config.getOrThrow<string>("JWT_SECRET");
    this.redis = new Redis({
      host: config.get<string>("REDIS_HOST") ?? "localhost",
      port: Number(config.get<string>("REDIS_PORT") ?? "6380"),
      lazyConnect: true,
      connectTimeout: 1500,
      commandTimeout: 2000,
      maxRetriesPerRequest: 1,
    });
    this.redis.on("error", () => undefined);
  }

  async retryAfter(email: string): Promise<number> {
    const identifier = createHmac("sha256", this.secret).update("login-rate-limit:").update(email.trim().toLowerCase()).digest("hex");
    try {
      const result = await this.redis.eval(RECORD_ATTEMPT, 1, `plataforma:auth:login:${identifier}`, MAX_ATTEMPTS, WINDOW_SECONDS);
      if (typeof result === "number" && Number.isInteger(result) && result >= 0) return result;
      throw new Error("Invalid rate limit result");
    } catch {
      throw new ServiceUnavailableException("Authentication temporarily unavailable");
    }
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }
}
