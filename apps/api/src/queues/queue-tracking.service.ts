import { Injectable } from "@nestjs/common";
import {
  Prisma,
  QueueEventStatus,
} from "@prisma/client";
import { PrismaService } from "@plataforma/database";
import { Job } from "bullmq";
import { QueueName } from "./queue-names";
import type { QueueJobData } from "./queues.service";

@Injectable()
export class QueueTrackingService {
  constructor(private readonly prisma: PrismaService) {}

  recordWaiting(
    queueName: QueueName,
    job: Job<QueueJobData>,
  ) {
    return this.createEvent(
      queueName,
      job,
      QueueEventStatus.WAITING,
    );
  }

  recordActive(
    queueName: QueueName,
    job: Job<QueueJobData>,
  ) {
    return this.createEvent(
      queueName,
      job,
      QueueEventStatus.ACTIVE,
    );
  }

  recordCompleted(
    queueName: QueueName,
    job: Job<QueueJobData>,
    result: unknown,
  ) {
    return this.createEvent(
      queueName,
      job,
      QueueEventStatus.COMPLETED,
      result,
    );
  }

  recordFailed(
    queueName: QueueName,
    job: Job<QueueJobData>,
    error: unknown,
  ) {
    return this.createEvent(
      queueName,
      job,
      QueueEventStatus.FAILED,
      undefined,
      error instanceof Error
        ? error.message
        : String(error),
    );
  }

  private createEvent(
    queueName: QueueName,
    job: Job<QueueJobData>,
    status: QueueEventStatus,
    result?: unknown,
    error?: string,
  ) {
    return this.prisma.queueEvent.create({
      data: {
        companyId: job.data.companyId,
        queueName,
        jobId: job.id ?? "unassigned",
        jobName: job.name,
        status,
        attemptsMade: job.attemptsMade,
        payload: this.toJsonValue(job.data),
        result: this.toJsonValue(result),
        error,
      },
    });
  }

  private toJsonValue(
    value: unknown,
  ): Prisma.InputJsonValue | undefined {
    if (value === undefined) {
      return undefined;
    }

    return JSON.parse(
      JSON.stringify(value),
    ) as Prisma.InputJsonValue;
  }
}
