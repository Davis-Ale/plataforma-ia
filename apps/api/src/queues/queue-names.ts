export const SYNC_QUEUE = "sync-queue";
export const NOTIFY_QUEUE = "notify-queue";
export const RETRY_QUEUE = "retry-queue";

export type QueueName =
  | typeof SYNC_QUEUE
  | typeof NOTIFY_QUEUE
  | typeof RETRY_QUEUE;
