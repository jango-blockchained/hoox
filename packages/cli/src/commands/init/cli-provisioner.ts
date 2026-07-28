/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CLI implementation of the Provisioner interface.
 * Uses `wrangler` CLI via Bun.spawn to create Cloudflare resources.
 */
import type {
  Provisioner,
  ProvisioningPlan,
  ProvisionResult,
} from "@jango-blockchained/hoox-shared";

export class CLIProvisioner implements Provisioner {
  async provision(plan: ProvisioningPlan): Promise<ProvisionResult> {
    const created: string[] = [];
    const errors: string[] = [];

    for (const db of plan.d1Databases) {
      try {
        const proc = Bun.spawn(["wrangler", "d1", "create", db], {
          stdout: "pipe",
          stderr: "pipe",
        });
        await new Response(proc.stdout).text();
        const exitCode = await proc.exited;
        if (exitCode === 0) {
          created.push(`D1:${db}`);
        } else {
          const err = await new Response(proc.stderr).text();
          errors.push(`D1:${db} — ${err.trim() || `exit code ${exitCode}`}`);
        }
      } catch (e) {
        errors.push(`D1:${db} — ${(e as Error).message}`);
      }
    }

    for (const ns of plan.kvNamespaces) {
      try {
        const proc = Bun.spawn(["wrangler", "kv", "namespace", "create", ns], {
          stdout: "pipe",
          stderr: "pipe",
        });
        await new Response(proc.stdout).text();
        const exitCode = await proc.exited;
        if (exitCode === 0) {
          created.push(`KV:${ns}`);
        } else {
          const err = await new Response(proc.stderr).text();
          errors.push(`KV:${ns} — ${err.trim() || `exit code ${exitCode}`}`);
        }
      } catch (e) {
        errors.push(`KV:${ns} — ${(e as Error).message}`);
      }
    }

    return {
      success: errors.length === 0,
      created,
      errors,
    };
  }

  async check(plan: ProvisioningPlan): Promise<ProvisionResult> {
    // Dry-run: just report what would be created
    const created: string[] = [
      ...plan.d1Databases.map((d) => `D1:${d}`),
      ...plan.kvNamespaces.map((k) => `KV:${k}`),
    ];
    return { success: true, created, errors: [] };
  }
}
