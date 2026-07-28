/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Logger middleware for Cloudflare Workers
 * Adapted from workers/agent-worker/src/middleware/logger.ts
 */

import { toError } from "../errors";

export interface LogContext {
  service: string;
  module?: string;
}

interface LogEntry {
  level: "debug" | "info" | "warn" | "error";
  timestamp: string;
  service: string;
  module?: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export function createLogger(ctx: LogContext): Logger {
  const base = { service: ctx.service, module: ctx.module };

  function emit(
    level: LogEntry["level"],
    message: string,
    context?: Record<string, unknown>
  ) {
    const entry: LogEntry = {
      level,
      timestamp: new Date().toISOString(),
      ...base,
      message,
      ...(context && { context }),
    };
    const line = JSON.stringify(entry);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else if (level === "debug") console.debug(line);
    else console.info(line);
  }

  return {
    debug: (msg, ctx) => emit("debug", msg, ctx),
    info: (msg, ctx) => emit("info", msg, ctx),
    warn: (msg, ctx) => emit("warn", msg, ctx),
    error: (msg, ctx) => emit("error", msg, ctx),
  };
}

export function withRequestLog<E>(
  handler: (
    request: Request,
    env: E,
    ctx: ExecutionContext
  ) => Promise<Response>,
  logCtx: LogContext
): (request: Request, env: E, ctx: ExecutionContext) => Promise<Response> {
  return async (request: Request, env: E, ctx: ExecutionContext) => {
    const start = Date.now();
    const logger = createLogger(logCtx);

    try {
      const response = await handler(request, env, ctx);
      const duration = Date.now() - start;
      const url = new URL(request.url);
      logger.info(`${request.method} ${url.pathname}`, {
        method: request.method,
        path: url.pathname,
        status: response.status,
        durationMs: duration,
      });
      return response;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error("Request failed", {
        method: request.method,
        path: new URL(request.url).pathname,
        durationMs: duration,
        error: toError(error),
      });
      throw error;
    }
  };
}
