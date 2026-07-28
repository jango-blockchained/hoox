/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared types for the Setup Wizard Engine.
 * Pure types — no runtime dependencies, Worker-compatible.
 */

export type StepId =
  | "PREREQUISITES"
  | "CLOUDFLARE_CONFIG"
  | "WORKER_SELECTION"
  | "PROVISIONING"
  | "SECRETS"
  | "CONFIG_WRITE"
  | "DEPLOY"
  | "DONE";

export type WorkerPresetName = "minimal" | "standard" | "full" | "custom";

export interface WorkerPreset {
  name: WorkerPresetName;
  label: string;
  description: string;
  workers: string[];
  integrations: string[];
}

export interface IntegratedService {
  key: string;
  label: string;
  workerName: string;
  secrets: Record<string, string>; // name -> prompt label
  vars?: Record<string, string>;
}

export interface WorkerConfig {
  enabled: boolean;
  path: string;
  vars: Record<string, string>;
  secrets: string[];
}

export interface WorkersJsonConfig {
  global: {
    cloudflare_api_token: string;
    cloudflare_account_id: string;
    cloudflare_secret_store_id: string;
    subdomain_prefix: string;
  };
  workers: Record<string, WorkerConfig>;
}

export interface ProvisioningPlan {
  d1Databases: string[];
  kvNamespaces: string[];
  r2Buckets: string[];
  queues: string[];
}

export interface ProvisionResult {
  success: boolean;
  created: string[];
  errors: string[];
}

export interface WizardCloudflareConfig {
  apiToken: string;
  accountId: string;
  secretStoreId: string;
  subdomain: string;
}

export interface WizardState {
  step: StepId;
  completedSteps: StepId[];
  cloudflareConfig?: WizardCloudflareConfig;
  selectedWorkers: string[];
  selectedIntegrations: string[];
  secrets: Record<string, Record<string, string>>;
  preset?: WorkerPresetName;
  provisioningResults?: ProvisionResult;
  startedAt: number;
  updatedAt: number;
}

export interface StepDefinition {
  id: StepId;
  label: string;
  canGoBack: boolean;
  optional: boolean;
  validate(state: WizardState, input: Record<string, unknown>): string[];
}
