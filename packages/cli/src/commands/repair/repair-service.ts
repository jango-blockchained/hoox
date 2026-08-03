/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CloudflareService } from "../../services/cloudflare/index.js";
import { SecretsService } from "../../services/secrets/index.js";
import type { RepairStepResult, RepairCheckResult } from "./types.js";

export interface RepairSystemCheckOptions {
  /**
   * When true, runs `bun install` as a check step.
   * Default false — install is side-effectful and slow for a diagnose command.
   */
  installDeps?: boolean;
  /**
   * When true, runs `bun run typecheck` as a check step.
   * Default true.
   */
  typecheck?: boolean;
}

export interface RepairServiceDeps {
  spawn?: typeof Bun.spawn;
  cloudflare?: CloudflareService;
  createSecrets?: () => Promise<SecretsService>;
  validateSchema?: () => Promise<
    {
      errors: Array<{ severity: string }>;
    }[]
  >;
}

type SpawnFn = typeof Bun.spawn;

export class RepairService {
  private readonly spawn: SpawnFn;
  private readonly cloudflare: CloudflareService;
  private readonly createSecrets: () => Promise<SecretsService>;
  private readonly validateSchema: () => Promise<
    { errors: Array<{ severity: string }> }[]
  >;

  constructor(deps: RepairServiceDeps = {}) {
    this.spawn = deps.spawn ?? Bun.spawn.bind(Bun);
    this.cloudflare = deps.cloudflare ?? new CloudflareService();
    this.createSecrets = deps.createSecrets ?? (() => SecretsService.create());
    this.validateSchema =
      deps.validateSchema ??
      (async () => {
        const { SchemaService } =
          await import("../../services/schema/schema-service.js");
        return new SchemaService().validateAll();
      });
  }

  async runSystemCheck(
    options: RepairSystemCheckOptions = {}
  ): Promise<RepairCheckResult> {
    const installDeps = options.installDeps === true;
    const runTypecheck = options.typecheck !== false;
    const steps: RepairStepResult[] = [];

    // Step 1: Repository integrity (worker submodules)
    steps.push(
      await this.runSpawnStep(
        "Worker submodules",
        ["bun", "run", "check:worker-submodules"],
        "All submodules present",
        "Missing submodules"
      )
    );

    // Step 2: Dependencies (opt-in — side-effectful)
    if (installDeps) {
      steps.push(
        await this.runSpawnStep(
          "Dependencies",
          ["bun", "install"],
          "All dependencies installed",
          "bun install failed"
        )
      );
    } else {
      steps.push({
        step: "Dependencies",
        success: true,
        message: "Skipped (pass installDeps to run bun install)",
      });
    }

    // Step 3: TypeScript
    if (runTypecheck) {
      steps.push(
        await this.runSpawnStep(
          "TypeScript",
          ["bun", "run", "typecheck"],
          "No type errors",
          "TypeScript errors found"
        )
      );
    } else {
      steps.push({
        step: "TypeScript",
        success: true,
        message: "Skipped",
      });
    }

    // Step 4: Infrastructure
    try {
      const d1Result = await this.cloudflare.d1List();
      const kvResult = await this.cloudflare.kvList();
      const r2Result = await this.cloudflare.r2List();
      const queueResult = await this.cloudflare.queueList();

      let infraOk = true;
      const details: string[] = [];
      if (d1Result.ok) details.push("D1: ✓");
      else {
        infraOk = false;
        details.push("D1: ✗");
      }
      if (kvResult.ok) details.push("KV: ✓");
      else {
        infraOk = false;
        details.push("KV: ✗");
      }
      if (r2Result.ok) details.push("R2: ✓");
      else {
        infraOk = false;
        details.push("R2: ✗");
      }
      if (queueResult.ok) details.push("Queues: ✓");
      else {
        infraOk = false;
        details.push("Queues: ✗");
      }

      steps.push({
        step: "Infrastructure",
        success: infraOk,
        message: details.join(", "),
      });
    } catch (err) {
      steps.push({
        step: "Infrastructure",
        success: false,
        error: String(err),
      });
    }

    // Step 5: Secrets
    try {
      const secrets = await this.createSecrets();
      const allSecrets = secrets.listAllSecrets();
      let missingCount = 0;
      let totalSecrets = 0;
      for (const workerName of Object.keys(allSecrets)) {
        const check = await secrets.checkLocalSecrets(workerName);
        totalSecrets += check.secrets.length;
        missingCount += check.missing.length;
      }
      steps.push({
        step: "Secrets",
        success: missingCount === 0,
        message:
          missingCount === 0
            ? `All ${totalSecrets} secrets present`
            : `${missingCount}/${totalSecrets} missing`,
      });
    } catch (err) {
      steps.push({ step: "Secrets", success: false, error: String(err) });
    }

    // Step 6: Worker config schema validation
    try {
      const results = await this.validateSchema();
      const totalErrors = results.reduce(
        (sum, r) => sum + r.errors.filter((e) => e.severity === "error").length,
        0
      );
      steps.push({
        step: "Worker config schema",
        success: totalErrors === 0,
        message:
          totalErrors === 0
            ? "All workers match manifest"
            : `${totalErrors} schema issue(s) found`,
      });
    } catch (err) {
      steps.push({
        step: "Worker config schema",
        success: false,
        error: String(err),
      });
    }

    const passed = steps.filter((s) => s.success).length;
    const failed = steps.filter((s) => !s.success).length;
    return {
      steps,
      allPassed: failed === 0,
      passedCount: passed,
      failedCount: failed,
    };
  }

  private async runSpawnStep(
    step: string,
    args: string[],
    okMessage: string,
    failMessage: string
  ): Promise<RepairStepResult> {
    try {
      const proc = this.spawn(args, {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exit = await proc.exited;
      return {
        step,
        success: exit === 0,
        message: exit === 0 ? okMessage : failMessage,
      };
    } catch (err) {
      return {
        step,
        success: false,
        error: String(err),
      };
    }
  }
}
