import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { RETRY_QUEUE } from "../queue-names";
import { QueueTrackingService } from "../queue-tracking.service";
import type { QueueJobData } from "../queues.service";

@Processor(RETRY_QUEUE, {
  concurrency: 3,
})
export class RetryProcessor extends WorkerHost {
  private readonly logger = new Logger(RetryProcessor.name);

  constructor(
    private readonly queueTrackingService: QueueTrackingService,
  ) {
    super();
  }

  async process(job: Job<QueueJobData>) {
    await this.queueTrackingService.recordActive(
      RETRY_QUEUE,
      job,
    );

    try {
      this.logger.log(
        `Processing ${RETRY_QUEUE}:${job.name}:${job.id}`,
      );

      const result = {
        queue: RETRY_QUEUE,
        jobId: job.id,
        jobName: job.name,
        processedAt: new Date().toISOString(),
      };

      await this.queueTrackingService.recordCompleted(
        RETRY_QUEUE,
        job,
        result,
      );

      return result;
    } catch (error) {
      await this.queueTrackingService.recordFailed(
        RETRY_QUEUE,
        job,
        error,
      );

      throw error;
    }
  }
}
