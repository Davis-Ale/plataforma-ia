import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { NOTIFY_QUEUE } from "../queue-names";
import { QueueJobData } from "../queues.service";

@Processor(NOTIFY_QUEUE)
export class NotifyProcessor extends WorkerHost {
  private readonly logger = new Logger(NotifyProcessor.name);

  async process(job: Job<QueueJobData>) {
    this.logger.log(
      `Processing ${NOTIFY_QUEUE}:${job.name}:${job.id}`,
    );

    return {
      queue: NOTIFY_QUEUE,
      jobId: job.id,
      jobName: job.name,
      processedAt: new Date().toISOString(),
    };
  }
}
