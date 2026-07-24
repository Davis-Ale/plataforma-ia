import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { JobsOptions, Queue } from "bullmq";
import {
  NOTIFY_QUEUE,
  RETRY_QUEUE,
  SYNC_QUEUE,
} from "./queue-names";

export type QueueJobData = Record<string, unknown>;

@Injectable()
export class QueuesService {
  constructor(
    @InjectQueue(SYNC_QUEUE)
    private readonly syncQueue: Queue,
    @InjectQueue(NOTIFY_QUEUE)
    private readonly notifyQueue: Queue,
    @InjectQueue(RETRY_QUEUE)
    private readonly retryQueue: Queue,
  ) {}

  async addSyncJob(
    name: string,
    data: QueueJobData,
    options?: JobsOptions,
  ) {
    return this.syncQueue.add(name, data, options);
  }

  async addNotifyJob(
    name: string,
    data: QueueJobData,
    options?: JobsOptions,
  ) {
    return this.notifyQueue.add(name, data, options);
  }

  async addRetryJob(
    name: string,
    data: QueueJobData,
    options?: JobsOptions,
  ) {
    return this.retryQueue.add(name, data, options);
  }
}
