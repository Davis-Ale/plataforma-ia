import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { RETRY_QUEUE } from "../queue-names";
import { QueueJobData } from "../queues.service";

@Processor(RETRY_QUEUE)
export class RetryProcessor extends WorkerHost {
  private readonly logger = new Logger(RetryProcessor.name);

  async process(job: Job<QueueJobData>) {
    this.logger.log(
      `Processing ${RETRY_QUEUE}:${job.name}:${job.id}`,
    );

    return {
      queue: RETRY_QUEUE,
      jobId: job.id,
      jobName: job.name,
      processedAt: new Date().toISOString(),
    };
  }
}
