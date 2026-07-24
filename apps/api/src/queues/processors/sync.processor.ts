import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { SYNC_QUEUE } from "../queue-names";
import { QueueJobData } from "../queues.service";

@Processor(SYNC_QUEUE)
export class SyncProcessor extends WorkerHost {
  private readonly logger = new Logger(SyncProcessor.name);

  async process(job: Job<QueueJobData>) {
    this.logger.log(
      `Processing ${SYNC_QUEUE}:${job.name}:${job.id}`,
    );

    return {
      queue: SYNC_QUEUE,
      jobId: job.id,
      jobName: job.name,
      processedAt: new Date().toISOString(),
    };
  }
}
