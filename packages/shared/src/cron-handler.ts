/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ScheduledEvent } from "@cloudflare/workers-types";

export interface CronHandlerOptions<Env = unknown> {
  /** Name of the worker for logging context */
  name: string;
  /** Handler function to execute */
  handler: (
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ) => Promise<void> | void;
  /** Optional logger instance */
  logger?: {
    info(message: string, data?: Record<string, unknown>): void;
    error(message: string, data?: Record<string, unknown>): void;
  };
}

/**
 * Creates a standardized cron handler with consistent logging and error handling.
 *
 * Usage:
 * ```typescript
 * const cronHandler = createCronHandler({
 *   name: "agent-worker",
 *   handler: async (event, env, ctx) => {
 *     await runAgentRoutine(env);
 *   },
 *   logger: createLogger({ service: "agent-worker" })
 * });
 *
 * export default {
 *   async scheduled(event, env, ctx) {
 *     return await cronHandler(event, env, ctx);
 *   }
 * };
 * ```
 */
export function createCronHandler<Env = unknown>(
  options: CronHandlerOptions<Env>
) {
  const { name, handler, logger } = options;

  return async (
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> => {
    const startTime = Date.now();

    logger?.info(`${name} cron triggered`, {
      cron: event.cron,
      scheduledTime: event.scheduledTime,
    });

    try {
      await handler(event, env, ctx);

      const durationMs = Date.now() - startTime;
      logger?.info(`${name} cron handler completed successfully`, {
        cron: event.cron,
        durationMs,
      });
    } catch (error: unknown) {
      const durationMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      logger?.error(`${name} cron handler failed`, {
        cron: event.cron,
        durationMs,
        error: errorMsg,
      });

      throw error;
    }
  };
}
