/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Router type definitions for standardized worker routing
 * Compatible with Cloudflare Workers edge runtime
 */

export type RouteParams = Record<string, string>;

/**
 * Handler type for route handlers.
 * TEnv is the environment type with bindings.
 */
export type Handler<TEnv = unknown> = (
  request: Request,
  env: TEnv,
  ctx: ExecutionContext,
  params?: RouteParams
) => Promise<Response | void>;

/**
 * Middleware handler type - uses any to allow compatibility with
 * stricter Env types that don't have index signatures.
 * This enables InternalAuthEnv middleware to be used with any Env.
 */
export type MiddlewareHandler<TEnv = unknown> = (
  request: Request,
  env: TEnv,
  ctx: ExecutionContext
) => Promise<Response | void>;

export interface RouteDefinition<TEnv = unknown> {
  path: string;
  method: string;
  handler: Handler<TEnv>;
  middleware?: MiddlewareHandler<TEnv>[];
  params?: string[];
  regex?: RegExp;
}

export interface Router<TEnv = unknown> {
  get(
    path: string,
    handler: Handler<TEnv>,
    middleware?: MiddlewareHandler<TEnv>[]
  ): void;
  post(
    path: string,
    handler: Handler<TEnv>,
    middleware?: MiddlewareHandler<TEnv>[]
  ): void;
  put(
    path: string,
    handler: Handler<TEnv>,
    middleware?: MiddlewareHandler<TEnv>[]
  ): void;
  delete(
    path: string,
    handler: Handler<TEnv>,
    middleware?: MiddlewareHandler<TEnv>[]
  ): void;
  handle(request: Request, env: TEnv, ctx: ExecutionContext): Promise<Response>;
}
