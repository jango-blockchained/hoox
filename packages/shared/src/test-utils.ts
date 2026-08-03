/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

export interface MockKVNamespace<T = unknown> {
  get: (key: string) => Promise<T | null>;
  put: (
    key: string,
    value: string | ReadableStream,
    options?: unknown
  ) => Promise<void>;
  delete: (key: string) => Promise<void>;
  list: (options?: {
    prefix?: string;
    limit?: number;
  }) => Promise<{ keys: { name: string }[] }>;
}

export function createMockKV<T = unknown>(
  overrides?: Partial<MockKVNamespace<T>>
): MockKVNamespace<T> {
  return {
    get: async (_key: string) => null as T | null,
    put: async (
      _key: string,
      _value: string | ReadableStream,
      _options?: unknown
    ) => {},
    delete: async (_key: string) => {},
    list: async (_options?: { prefix?: string; limit?: number }) => ({
      keys: [],
    }),
    ...overrides,
  };
}

export interface MockR2Bucket {
  put: (
    key: string,
    value: ReadableStream | ArrayBuffer,
    options?: unknown
  ) => Promise<{ key: string }>;
  get: (
    key: string
  ) => Promise<{ body: ReadableStream; key: string; size: number } | null>;
  delete: (key: string) => Promise<void>;
  list: (options?: {
    prefix?: string;
    limit?: number;
  }) => Promise<{ objects: { key: string }[] }>;
}

export function createMockR2(overrides?: Partial<MockR2Bucket>): MockR2Bucket {
  return {
    put: async (
      key: string,
      _value: ReadableStream | ArrayBuffer,
      _options?: unknown
    ) => ({
      key,
    }),
    get: async (_key: string) => null,
    delete: async (_key: string) => {},
    list: async (_options?: { prefix?: string; limit?: number }) => ({
      objects: [],
    }),
    ...overrides,
  };
}

export interface MockD1PreparedStatement {
  bind: (...params: unknown[]) => MockD1PreparedStatement;
  run: () => Promise<{
    success: boolean;
    results?: unknown[];
    error?: string;
    meta?: unknown;
  }>;
  all: () => Promise<{ success: boolean; results?: unknown[]; error?: string }>;
  first: <T = unknown>() => Promise<T | null>;
}

export interface MockD1Database {
  prepare: (sql: string) => MockD1PreparedStatement;
  dump: () => Promise<ArrayBuffer>;
  batch: (
    statements: unknown[]
  ) => Promise<{ success: boolean; results?: unknown[]; error?: string }[]>;
  exec: (sql: string) => Promise<{ success: boolean; error?: string }>;
}

function createMockPreparedStatement(): MockD1PreparedStatement {
  return {
    bind: (..._params: unknown[]) => createMockPreparedStatement(),
    run: async () => ({ success: true }),
    all: async () => ({ success: true, results: [] }),
    first: async <T = unknown>() => null as T | null,
  };
}

export function createMockD1(
  overrides?: Partial<MockD1Database>
): MockD1Database {
  return {
    prepare: (_sql: string) => createMockPreparedStatement(),
    dump: async () => new ArrayBuffer(0),
    batch: async (_statements: unknown[]) => [],
    exec: async (_sql: string) => ({ success: true }),
    ...overrides,
  };
}

export interface MockFetcher {
  fetch: (request: Request | string, init?: RequestInit) => Promise<Response>;
}

export function createMockFetcher(response?: Response): MockFetcher {
  const defaultResponse = response ?? new Response("OK", { status: 200 });
  return {
    fetch: async (_request: Request | string, _init?: RequestInit) =>
      defaultResponse,
  };
}

export interface MockAnalyticsEngine {
  writeDataPoint: (data: {
    blobs?: string[];
    doubles?: number[];
    indexes?: string[];
  }) => void;
}

export function createMockAnalyticsEngine(): MockAnalyticsEngine {
  return {
    writeDataPoint: (_data: {
      blobs?: string[];
      doubles?: number[];
      indexes?: string[];
    }) => {},
  };
}

export interface MockAnalyticsEngineDataset {
  writeDataPoint: (data: {
    blobs?: string[];
    doubles?: number[];
    indexes?: string[];
  }) => void;
}

export function createMockAnalyticsEngineDataset(): MockAnalyticsEngineDataset {
  return createMockAnalyticsEngine();
}

export interface MockQueue {
  send: (body: unknown, options?: { delay?: number }) => Promise<void>;
  sendBatch: (messages: { body: unknown }[]) => Promise<void>;
}

export function createMockQueue(): MockQueue {
  return {
    send: async (_body: unknown, _options?: { delay?: number }) => {},
    sendBatch: async (_messages: { body: unknown }[]) => {},
  };
}

export interface MockVectorizeIndex {
  query: (
    vector: number[],
    options?: { topK?: number }
  ) => Promise<{ matches: { id: string; score: number }[] }>;
  upsert: (vectors: { id: string; values: number[] }[]) => Promise<void>;
  deleteByIds: (ids: string[]) => Promise<void>;
  describe: () => Promise<{ dimension: number; totalVectors?: number }>;
}

export function createMockVectorizeIndex(
  overrides?: Partial<MockVectorizeIndex>
): MockVectorizeIndex {
  return {
    query: async (_vector: number[], _options?: { topK?: number }) => ({
      matches: [],
    }),
    upsert: async (_vectors: { id: string; values: number[] }[]) => {},
    deleteByIds: async (_ids: string[]) => {},
    describe: async () => ({ dimension: 384, totalVectors: 0 }),
    ...overrides,
  };
}

export interface MockAi {
  run: (model: string, input: unknown) => Promise<unknown>;
}

export function createMockAi(overrides?: Partial<MockAi>): MockAi {
  return {
    run: async (_model: string, _input: unknown) => ({}),
    ...overrides,
  };
}

export interface MockExecutionContext {
  waitUntil: (promise: Promise<unknown>) => void;
  passThroughOnException: () => void;
}

export function createMockExecutionContext(
  overrides?: Partial<MockExecutionContext>
): MockExecutionContext {
  return {
    waitUntil: (_promise: Promise<unknown>) => {},
    passThroughOnException: () => {},
    ...overrides,
  };
}

export interface MockSecretsStore {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
  delete: (key: string) => Promise<void>;
}

export function createMockSecretsStore(
  overrides?: Partial<MockSecretsStore>
): MockSecretsStore {
  return {
    get: async (_key: string) => null,
    put: async (_key: string, _value: string) => {},
    delete: async (_key: string) => {},
    ...overrides,
  };
}

export interface ServiceBinding {
  fetch: (request: Request | string, init?: RequestInit) => Promise<Response>;
}

export function createMockEnv<T extends Record<string, unknown>>(
  overrides: T
): T {
  return overrides;
}
