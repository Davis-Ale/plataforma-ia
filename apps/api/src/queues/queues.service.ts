import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { JobsOptions, Queue } from "bullmq";
import {
  NOTIFY_QUEUE,
  QueueName,
  RETRY_QUEUE,
  SYNC_QUEUE,
} from "./queue-names";
import { QueueTrackingService } from "./queue-tracking.service";

export type QueueJobData = {
  companyId: string;
  [key: string]: unknown;
};

@Injectable()
export class QueuesService {
  constructor(
    @InjectQueue(SYNC_QUEUE)
    private readonly syncQueue: Queue<QueueJobData>,
    @InjectQueue(NOTIFY_QUEUE)
    private readonly notifyQueue: Queue<QueueJobData>,
    @InjectQueue(RETRY_QUEUE)
    private readonly retryQueue: Queue<QueueJobData>,
    private readonly queueTrackingService: QueueTrackingService,
  ) {}

  addSyncJob(
    name: string,
    data: QueueJobData,
    options?: JobsOptions,
  ) {
    return this.addJob(
      SYNC_QUEUE,
      this.syncQueue,
      name,
      data,
      options,
    );
  }

  addNotifyJob(
    name: string,
    data: QueueJobData,
    options?: JobsOptions,
  ) {
    return this.addJob(
      NOTIFY_QUEUE,
      this.notifyQueue,
      name,
      data,
      options,
    );
  }

  addRetryJob(
    name: string,
    data: QueueJobData,
    options?: JobsOptions,
  ) {
    return this.addJob(
      RETRY_QUEUE,
      this.retryQueue,
      name,
      data,
      options,
    );
  }

  private async addJob(
    queueName: QueueName,
    queue: Queue<QueueJobData>,
    name: string,
    data: QueueJobData,
    options?: JobsOptions,
  ) {
    const job = await queue.add(
      name,
      data,
      options,
    );

    await this.queueTrackingService.recordWaiting(
      queueName,
      job,
    );

    return job;
  }
}
