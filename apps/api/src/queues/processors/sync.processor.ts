import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { SYNC_QUEUE } from "../queue-names";
import { QueueTrackingService } from "../queue-tracking.service";
import type { QueueJobData } from "../queues.service";

@Processor(SYNC_QUEUE, {
  concurrency: 5,
})
export class SyncProcessor extends WorkerHost {
  private readonly logger = new Logger(SyncProcessor.name);

  constructor(
    private readonly queueTrackingService: QueueTrackingService,
  ) {
    super();
  }

  async process(job: Job<QueueJobData>) {
    await this.queueTrackingService.recordActive(
      SYNC_QUEUE,
      job,
    );

    try {
      this.logger.log(
        `Processing ${SYNC_QUEUE}:${job.name}:${job.id}`,
      );

      const result = {
        queue: SYNC_QUEUE,
        jobId: job.id,
        jobName: job.name,
        processedAt: new Date().toISOString(),
      };

      await this.queueTrackingService.recordCompleted(
        SYNC_QUEUE,
        job,
        result,
      );

      return result;
    } catch (error) {
      await this.queueTrackingService.recordFailed(
        SYNC_QUEUE,
        job,
        error,
      );

      throw error;
    }
  }
}
