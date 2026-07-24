import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { NOTIFY_QUEUE } from "../queue-names";
import { QueueTrackingService } from "../queue-tracking.service";
import type { QueueJobData } from "../queues.service";

@Processor(NOTIFY_QUEUE, {
  concurrency: 10,
})
export class NotifyProcessor extends WorkerHost {
  private readonly logger = new Logger(NotifyProcessor.name);

  constructor(
    private readonly queueTrackingService: QueueTrackingService,
  ) {
    super();
  }

  async process(job: Job<QueueJobData>) {
    await this.queueTrackingService.recordActive(
      NOTIFY_QUEUE,
      job,
    );

    try {
      this.logger.log(
        `Processing ${NOTIFY_QUEUE}:${job.name}:${job.id}`,
      );

      const result = {
        queue: NOTIFY_QUEUE,
        jobId: job.id,
        jobName: job.name,
        processedAt: new Date().toISOString(),
      };

      await this.queueTrackingService.recordCompleted(
        NOTIFY_QUEUE,
        job,
        result,
      );

      return result;
    } catch (error) {
      await this.queueTrackingService.recordFailed(
        NOTIFY_QUEUE,
        job,
        error,
      );

      throw error;
    }
  }
}
