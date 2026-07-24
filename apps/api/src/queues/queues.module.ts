import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { BullBoardModule } from "@bull-board/nestjs";
import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { DatabaseModule } from "@plataforma/database";
import { createBullBoardAuthMiddleware } from "./bull-board-auth.middleware";
import { NotifyProcessor } from "./processors/notify.processor";
import { RetryProcessor } from "./processors/retry.processor";
import { SyncProcessor } from "./processors/sync.processor";
import {
  NOTIFY_QUEUE,
  RETRY_QUEUE,
  SYNC_QUEUE,
} from "./queue-names";
import { DEFAULT_JOB_OPTIONS } from "./queue-options";
import { QueueTrackingService } from "./queue-tracking.service";
import { QueuesService } from "./queues.service";

@Module({
  imports: [
    DatabaseModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host:
            configService.get<string>("REDIS_HOST") ??
            "localhost",
          port: Number(
            configService.get<string>("REDIS_PORT") ??
              "6380",
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
    BullBoardModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        route: "/admin/queues",
        adapter: ExpressAdapter,
        middleware: createBullBoardAuthMiddleware(
          configService.get<string>("BULL_BOARD_USER"),
          configService.get<string>(
            "BULL_BOARD_PASSWORD",
          ),
        ),
      }),
    }),
    BullBoardModule.forFeature(
      {
        name: SYNC_QUEUE,
        adapter: BullMQAdapter,
      },
      {
        name: NOTIFY_QUEUE,
        adapter: BullMQAdapter,
      },
      {
        name: RETRY_QUEUE,
        adapter: BullMQAdapter,
      },
    ),
  ],
  providers: [
    QueuesService,
    QueueTrackingService,
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
