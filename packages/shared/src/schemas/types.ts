/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Worker Manifest Schema — canonical definition of what each worker expects.
 */

export interface WorkerManifest {
  /** Worker name (e.g. "trade-worker") */
  name: string;
  /** Path relative to project root (e.g. "workers/trade-worker") */
  path: string;
  /** Vars the worker declares in its wrangler.jsonc `vars` section */
  vars: Record<string, VarDef>;
  /** Service bindings this worker calls */
  services: ServiceBindingDef[];
  /** Infrastructure bindings this worker needs */
  infrastructure: InfraBindings;
  /** Middleware this worker imports from @jango-blockchained/hoox-shared */
  middleware: string[];
  /** Cron triggers (empty array = none) */
  cron?: string[];
}

export interface VarDef {
  type: "secret" | "plaintext";
  description: string;
  /** Default value for plaintext vars (optional) */
  default?: string;
}

export interface ServiceBindingDef {
  binding: string;
  service: string;
  description: string;
}

export interface InfraBindings {
  kv?: KVBindingDef[];
  d1?: D1BindingDef[];
  r2?: R2BindingDef[];
  queues?: QueueBindingDef;
  ai?: boolean;
  vectorize?: VectorizeBindingDef[];
  analyticsEngine?: boolean;
  durableObjects?: DOBindingDef[];
  browser?: boolean;
}

export interface KVBindingDef {
  binding: string;
  description: string;
}

export interface D1BindingDef {
  binding: string;
  database: string;
  description?: string;
}

export interface R2BindingDef {
  binding: string;
  bucket: string;
  description?: string;
}

export interface QueueBindingDef {
  producer?: string[];
  consumer?: string[];
}

export interface VectorizeBindingDef {
  binding: string;
  index: string;
}

export interface DOBindingDef {
  name: string;
  className: string;
}

export interface ValidationError {
  worker: string;
  severity: "error" | "warning";
  message: string;
  file?: string;
}

export interface ValidationReport {
  worker: string;
  passed: boolean;
  errors: ValidationError[];
}
