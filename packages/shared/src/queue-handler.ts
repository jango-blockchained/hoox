/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBatch } from "@cloudflare/workers-types";

export interface QueueHandlerOptions<T> {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Array of delay times in seconds for exponential backoff */
  backoffDelays: number[];
  /** Handler function called for each message */
  onMessage: (message: T, attemptNumber: number) => Promise<unknown> | unknown;
  /** Called when a message fails and will be retried */
  onRetry?: (
    message: T,
    attemptNumber: number,
    error: string,
    delaySeconds: number
  ) => void | Promise<void>;
  /** Called when message is moved to DLQ (max retries exceeded) */
  onDLQ?: (
    message: T,
    attemptNumber: number,
    error: string
  ) => void | Promise<void>;
  /** Logger function for debugging */
  logger?: {
    info(msg: string, data?: unknown): void;
    error(msg: string, data?: unknown): void;
  };
}

/**
 * Creates a reusable queue handler with retry + exponential backoff logic.
 *
 * Usage:
 * ```typescript
 * const handler = createQueueHandler({
 *   maxRetries: 5,
 *   backoffDelays: [0, 30, 60, 300, 900],
 *   onMessage: async (msg) => {
 *     await executeTask(msg);
 *   },
 *   onDLQ: async (msg, attempts, error) => {
 *     await logFailedTask(msg, error);
 *   }
 * });
 *
 * export default {
 *   async queue(batch, env, ctx) {
 *     return await handler(batch);
 *   }
 * };
 * ```
 */
export function createQueueHandler<T>(options: QueueHandlerOptions<T>) {
  const { maxRetries, backoffDelays, onMessage, onRetry, onDLQ, logger } =
    options;

  return async (batch: MessageBatch<T>): Promise<void> => {
    for (const msg of batch.messages) {
      const attemptNumber = msg.attempts || 0;
      const logId = `[${msg.id}]`;

      try {
        logger?.info(
          `${logId} Processing message (attempt ${attemptNumber + 1})`
        );
        await onMessage(msg.body, attemptNumber);
        logger?.info(`${logId} Message processed successfully`);
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (attemptNumber < maxRetries) {
          const delaySeconds =
            backoffDelays[attemptNumber] ??
            backoffDelays[backoffDelays.length - 1];

          logger?.info(
            `${logId} Retrying in ${delaySeconds}s (attempt ${attemptNumber + 2}/${maxRetries + 1})`
          );

          await onRetry?.(msg.body, attemptNumber, errorMsg, delaySeconds);
          msg.retry({ delaySeconds });
        } else {
          logger?.error(
            `${logId} Max retries exceeded (${maxRetries + 1} attempts), moving to DLQ`
          );

          await onDLQ?.(msg.body, attemptNumber, errorMsg);
        }
      }
    }
  };
}
