/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * WizardEngine — Pure-logic state machine for the setup wizard.
 *
 * Manages step transitions, validation, and config building.
 * Does NOT depend on Node/Bun APIs — Worker-compatible.
 */
import type {
  StepId,
  StepDefinition,
  WizardState,
  WorkersJsonConfig,
  WorkerConfig,
  ProvisioningPlan,
  WorkerPresetName,
  ProvisionResult,
} from "./types";
import {
  PRESETS,
  INTEGRATIONS,
  BASE_WORKERS,
  BASE_SECRETS,
  resolveDependencies,
} from "./presets";

// ─── Step Definitions ──────────────────────────────────────────────────

const STEPS: StepDefinition[] = [
  {
    id: "PREREQUISITES",
    label: "System Prerequisites",
    canGoBack: false,
    optional: false,
    validate: validatePrerequisites,
  },
  {
    id: "CLOUDFLARE_CONFIG",
    label: "Cloudflare Configuration",
    canGoBack: true,
    optional: false,
    validate: validateCloudflareConfig,
  },
  {
    id: "WORKER_SELECTION",
    label: "Worker Selection",
    canGoBack: true,
    optional: false,
    validate: validateWorkerSelection,
  },
  {
    id: "PROVISIONING",
    label: "Infrastructure Provisioning",
    canGoBack: true,
    optional: true,
    validate: () => [],
  },
  {
    id: "SECRETS",
    label: "Secrets Configuration",
    canGoBack: true,
    optional: false,
    validate: validateSecrets,
  },
  {
    id: "CONFIG_WRITE",
    label: "Configuration Write",
    canGoBack: true,
    optional: false,
    validate: () => [],
  },
  {
    id: "DEPLOY",
    label: "Deploy",
    canGoBack: false,
    optional: true,
    validate: () => [],
  },
  {
    id: "DONE",
    label: "Complete",
    canGoBack: false,
    optional: false,
    validate: () => [],
  },
];

const STEP_ORDER: StepId[] = STEPS.map((s) => s.id);

// ─── Helpers ──────────────────────────────────────────────────────────

function createInitialState(): WizardState {
  return {
    step: "PREREQUISITES",
    completedSteps: [],
    selectedWorkers: [],
    selectedIntegrations: [],
    secrets: {},
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ─── Validators ───────────────────────────────────────────────────────

function validatePrerequisites(
  _state: WizardState,
  input: Record<string, unknown>
): string[] {
  const errors: string[] = [];
  if (!input.checksPassed) {
    errors.push("System prerequisite checks must pass before continuing");
  }
  return errors;
}

function validateCloudflareConfig(
  _state: WizardState,
  input: Record<string, unknown>
): string[] {
  const errors: string[] = [];
  const token = input.apiToken as string | undefined;
  const accountId = input.accountId as string | undefined;

  if (!token || String(token).trim().length === 0) {
    errors.push("Cloudflare API token is required");
  }
  if (!accountId || String(accountId).trim().length === 0) {
    errors.push("Cloudflare Account ID is required");
  }
  return errors;
}

function validateWorkerSelection(
  _state: WizardState,
  input: Record<string, unknown>
): string[] {
  const errors: string[] = [];
  const preset = input.preset as WorkerPresetName | undefined;
  const customWorkers = input.workers as string[] | undefined;

  if (preset === "custom" && (!customWorkers || customWorkers.length === 0)) {
    errors.push("At least one worker must be selected");
  }
  return errors;
}

function validateSecrets(
  state: WizardState,
  input: Record<string, unknown>
): string[] {
  const errors: string[] = [];
  const secrets = input.secrets as
    | Record<string, Record<string, string>>
    | undefined;
  if (!secrets || Object.keys(secrets).length === 0) {
    return [];
  }
  for (const integrationKey of state.selectedIntegrations) {
    const integration = INTEGRATIONS.find((i) => i.key === integrationKey);
    if (!integration) continue;
    const integrationSecrets = secrets[integrationKey];
    if (integrationSecrets) {
      for (const secretName of Object.keys(integration.secrets)) {
        const val = integrationSecrets[secretName];
        if (!val || String(val).trim().length === 0) {
          errors.push(
            `Secret "${integration.secrets[secretName]}" is required for ${integration.label}`
          );
        }
      }
    }
  }
  return errors;
}

// ─── Engine ───────────────────────────────────────────────────────────

export class WizardEngine {
  private state: WizardState;

  constructor(initialState?: Partial<WizardState>) {
    this.state = { ...createInitialState(), ...initialState };
  }

  /** Get a copy of the current state. */
  getState(): WizardState {
    return { ...this.state };
  }

  /** Get the current step definition. */
  getCurrentStep(): StepDefinition {
    return STEPS.find((s) => s.id === this.state.step) ?? STEPS[0];
  }

  /** Get list of completed step IDs. */
  getCompletedSteps(): StepId[] {
    return [...this.state.completedSteps];
  }

  /** Whether the current step can be proceeded (optional or already completed). */
  canProceed(): boolean {
    const step = this.getCurrentStep();
    return step.optional || this.state.completedSteps.includes(step.id);
  }

  /** Whether the user can navigate back from the current step. */
  canGoBack(): boolean {
    return this.getCurrentStep().canGoBack;
  }

  /**
   * Execute the current step with the given input.
   * Returns validation errors. If empty, advances to the next step.
   */
  execute(input: Record<string, unknown>): string[] {
    const currentStep = this.getCurrentStep();
    const errors = currentStep.validate(this.state, input);

    if (errors.length > 0) {
      return errors;
    }

    // Apply input to state
    this.applyInput(input);

    // Mark current step as completed
    if (!this.state.completedSteps.includes(this.state.step)) {
      this.state.completedSteps.push(this.state.step);
    }

    // Advance to next step
    const currentIdx = STEP_ORDER.indexOf(this.state.step);
    if (currentIdx < STEP_ORDER.length - 1) {
      this.state.step = STEP_ORDER[currentIdx + 1];
    }

    this.state.updatedAt = Date.now();
    return [];
  }

  /** Navigate back to the previous step. */
  goBack(): void {
    if (!this.canGoBack()) return;
    const currentIdx = STEP_ORDER.indexOf(this.state.step);
    if (currentIdx > 0) {
      const previousStep = STEP_ORDER[currentIdx - 1];
      this.state.step = previousStep;
      // Remove current step from completed if this is going back from completed step
      this.state.completedSteps = this.state.completedSteps.filter(
        (s) =>
          s !== this.state.step ||
          STEP_ORDER.indexOf(s) <= STEP_ORDER.indexOf(previousStep)
      );
    }
    this.state.updatedAt = Date.now();
  }

  /** Reset engine to initial state. */
  reset(): void {
    this.state = createInitialState();
  }

  /**
   * Build the full WorkersJsonConfig from current state.
   * This is the output of the wizard — written to wrangler.jsonc.
   */
  buildConfig(): WorkersJsonConfig {
    const cf = this.state.cloudflareConfig;
    const workers: Record<string, WorkerConfig> = {};

    // Base workers (always enabled)
    for (const [name, baseCfg] of Object.entries(BASE_WORKERS)) {
      workers[name] = {
        enabled: true,
        path: baseCfg.path,
        vars: { ...baseCfg.vars },
        secrets: [...(BASE_SECRETS[name] ?? [])],
      };
    }

    // Integration workers
    for (const key of this.state.selectedIntegrations) {
      const integration = INTEGRATIONS.find((i) => i.key === key);
      if (!integration) continue;

      const workerName = integration.workerName;
      if (!workers[workerName]) {
        workers[workerName] = {
          enabled: true,
          path: `workers/${workerName}`,
          vars: {},
          secrets: [],
        };
      }

      if (integration.vars) {
        Object.assign(workers[workerName].vars, integration.vars);
      }

      for (const secretName of Object.keys(integration.secrets)) {
        if (!workers[workerName].secrets.includes(secretName)) {
          workers[workerName].secrets.push(secretName);
        }
      }
    }

    // Extra selected workers not covered by integrations
    for (const workerName of this.state.selectedWorkers) {
      if (!workers[workerName]) {
        workers[workerName] = {
          enabled: true,
          path: `workers/${workerName}`,
          vars: {},
          secrets: [],
        };
      }
    }

    return {
      global: {
        cloudflare_api_token: cf?.apiToken ?? "",
        cloudflare_account_id: cf?.accountId ?? "",
        cloudflare_secret_store_id: cf?.secretStoreId ?? "",
        subdomain_prefix: cf?.subdomain ?? "",
      },
      workers,
    };
  }

  /**
   * Determine what Cloudflare resources need to be provisioned
   * based on selected workers and integrations.
   */
  getProvisioningPlan(): ProvisioningPlan {
    const plan: ProvisioningPlan = {
      d1Databases: [],
      kvNamespaces: [],
      r2Buckets: [],
      queues: [],
    };

    const allWorkers = [
      ...Object.keys(BASE_WORKERS),
      ...this.state.selectedWorkers,
      ...this.state.selectedIntegrations
        .map((k) => {
          const i = INTEGRATIONS.find((i) => i.key === k);
          return i?.workerName ?? "";
        })
        .filter(Boolean),
    ];

    const workerSet = new Set(allWorkers);

    if (workerSet.has("d1-worker")) {
      plan.d1Databases.push("hoox-db");
    }
    if (workerSet.has("hoox") || workerSet.has("analytics-worker")) {
      plan.kvNamespaces.push("CONFIG_KV");
    }
    if (workerSet.has("web3-wallet-worker")) {
      plan.kvNamespaces.push("WEB3_CACHE_KV");
    }

    // Deduplicate
    plan.d1Databases = [...new Set(plan.d1Databases)];
    plan.kvNamespaces = [...new Set(plan.kvNamespaces)];

    return plan;
  }

  // ── Private ─────────────────────────────────────────────────────────

  private applyInput(input: Record<string, unknown>): void {
    const step = this.state.step;

    switch (step) {
      case "PREREQUISITES":
        // No state mutation — just a gate
        break;

      case "CLOUDFLARE_CONFIG":
        this.state.cloudflareConfig = {
          apiToken: String(input.apiToken ?? ""),
          accountId: String(input.accountId ?? ""),
          secretStoreId: String(input.secretStoreId ?? ""),
          subdomain: String(input.subdomain ?? "cryptolinx"),
        };
        break;

      case "WORKER_SELECTION": {
        const preset = input.preset as WorkerPresetName;
        this.state.preset = preset;

        if (preset && preset !== "custom") {
          const presetDef = PRESETS.find((p) => p.name === preset);
          if (presetDef) {
            const resolved = resolveDependencies(presetDef.workers);
            this.state.selectedWorkers = resolved;
            this.state.selectedIntegrations = presetDef.integrations;
          }
        } else {
          const workers = input.workers as string[] | undefined;
          const integrations = input.integrations as string[] | undefined;
          if (workers) {
            this.state.selectedWorkers = resolveDependencies(workers);
          }
          if (integrations) {
            this.state.selectedIntegrations = integrations;
          }
        }
        break;
      }

      case "SECRETS":
        this.state.secrets =
          (input.secrets as Record<string, Record<string, string>>) ?? {};
        break;

      case "PROVISIONING":
        if (input.provisioningResults) {
          this.state.provisioningResults =
            input.provisioningResults as ProvisionResult;
        }
        break;

      case "CONFIG_WRITE":
      case "DEPLOY":
      case "DONE":
        // No state mutation for these steps (handled externally)
        break;
    }
  }
}
