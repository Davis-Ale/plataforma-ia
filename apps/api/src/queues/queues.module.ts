import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import { NotifyProcessor } from "./processors/notify.processor";
import { RetryProcessor } from "./processors/retry.processor";
import { SyncProcessor } from "./processors/sync.processor";
import {
  NOTIFY_QUEUE,
  RETRY_QUEUE,
  SYNC_QUEUE,
} from "./queue-names";
import { DEFAULT_JOB_OPTIONS } from "./queue-options";
import { QueuesService } from "./queues.service";

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>("REDIS_HOST") ?? "localhost",
          port: Number(
            configService.get<string>("REDIS_PORT") ?? "6380",
          ),
        },
      }),
    }),
    BullModule.registerQueue(
      {
        name: SYNC_QUEUE,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      },
      {
        name: NOTIFY_QUEUE,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      },
      {
        name: RETRY_QUEUE,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      },
    ),
  ],
  providers: [
    QueuesService,
    SyncProcessor,
    NotifyProcessor,
    RetryProcessor,
  ],
  exports: [
    QueuesService,
    BullModule,
  ],
})
export class QueuesModule {}
