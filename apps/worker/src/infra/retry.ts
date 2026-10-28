/**
 * Retry helpers shared by the topology, `RabbitMqService.consume` and the consumers.
 * Retries use per-delay queues (`<queue>.retry.10s`) whose TTL dead-letters back to the work queue;
 * the attempt number travels in the `x-attempt` header. Owner: M8.
 */

/** Header carrying how many retries a message has already been through (0 = first delivery). */
export const ATTEMPT_HEADER = 'x-attempt';
/** Header set by the ops "retry" endpoint to re-deliver a webhook to ONE endpoint only. */
export const TARGET_ENDPOINT_HEADER = 'x-target-endpoint';

/** Throw from a handler for failures worth retrying (network, provider outage, 5xx). */
export class TransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransientError';
  }
}

export interface ConsumeContext {
  /** Retries already done: 0 on the first delivery. */
  attempt: number;
  /** True when no further retry is available: a transient failure now ends in the DLQ. */
  lastAttempt: boolean;
}

/** `10000` → `10s`, `1500` → `1500ms`. Used in retry queue names. */
export function formatDelay(delayMs: number): string {
  return delayMs % 1000 === 0 ? `${delayMs / 1000}s` : `${delayMs}ms`;
}

export function retryQueueName(queue: string, delayMs: number): string {
  return `${queue}.retry.${formatDelay(delayMs)}`;
}

/** Delay before the next retry, or null when `attempt` retries have used up the schedule. */
export function nextDelay(delaysMs: readonly number[], attempt: number): number | null {
  return delaysMs[attempt] ?? null;
}

export function attemptOf(headers: Record<string, unknown> | undefined): number {
  const n = Number(headers?.[ATTEMPT_HEADER]);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export function stringHeader(
  headers: Record<string, unknown> | undefined,
  name: string,
): string | undefined {
  const v = headers?.[name];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}
