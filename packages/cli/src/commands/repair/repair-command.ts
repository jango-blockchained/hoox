import { Command } from "commander";
import { RepairService } from "./repair-service.js";
import { CloudflareService } from "../../services/cloudflare/index.js";
import { DbService } from "../../services/db/index.js";
import { KvSyncService } from "../../services/kv/kv-sync-service.js";
import { SecretsService } from "../../services/secrets/index.js";
import { doProvision, doProvisionDryRun } from "../infra/infra-command.js";
import {
  formatError,
  formatSuccess,
  formatTable,
  type FormatOptions,
  getFormatOptions,
} from "../../utils/formatters.js";
import { CLIError, ExitCode } from "../../utils/errors.js";
import { withErrorHandling } from "../../utils/error-handler.js";

async function handleCheck(
  fmt: FormatOptions,
  options: { installDeps?: boolean; typecheck?: boolean } = {}
): Promise<void> {
  try {
    const svc = new RepairService();
    const result = await svc.runSystemCheck({
      installDeps: Boolean(options.installDeps),
      // default true unless --no-typecheck
      typecheck: options.typecheck !== false,
    });

    if (fmt.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    } else {
      // Always show the per-step table so failures are actionable
      // (previously only printed "N check(s) failed" with no detail).
      const rows = result.steps.map((s) => ({
        Step: s.step,
        Status: s.success ? "ok" : "fail",
        Detail: s.message ?? s.error ?? "-",
      }));
      formatTable(rows, fmt);

      if (result.allPassed) {
        formatSuccess(`All ${result.passedCount} check(s) passed`, fmt);
      } else {
        formatError(
          new CLIError(
            `${result.failedCount} of ${result.steps.length} check(s) failed`,
            ExitCode.ERROR
          ),
          fmt
        );
      }
    }

    if (!result.allPassed) {
      process.exitCode = ExitCode.ERROR;
    }
  } catch (err) {
    formatError(err instanceof Error ? err : String(err), fmt);
    process.exitCode = ExitCode.ERROR;
  }
}

async function handleWorker(name: string, fmt: FormatOptions): Promise<void> {
  try {
    const { ConfigService } = await import("../../services/config/index.js");
    const config = new ConfigService();
    await config.load();
    const workerConfig = config.getWorker(name);
    if (!workerConfig) {
      formatError(
        new CLIError(`Worker "${name}" not found`, ExitCode.ERROR),
        fmt
      );
      process.exitCode = ExitCode.ERROR;
      return;
    }
    const cf = new CloudflareService();
    const result = await cf.deploy(workerConfig.path);
    if (result.ok) {
      formatSuccess(`Worker "${name}" deployed — ${result.value.url}`, fmt);
    } else {
      formatError(
        new CLIError(
          `Failed to deploy "${name}": ${result.error}`,
          ExitCode.ERROR
        ),
        fmt
      );
      process.exitCode = ExitCode.ERROR;
    }
  } catch (err) {
    formatError(err instanceof Error ? err : String(err), fmt);
    process.exitCode = ExitCode.ERROR;
  }
}

async function handleInfra(
  fmt: FormatOptions,
  options: { provision?: boolean; dryRun?: boolean } = {}
): Promise<void> {
  try {
    const cf = new CloudflareService();
    const checks = [
      { name: "D1", result: await cf.d1List() },
      { name: "KV", result: await cf.kvList() },
      { name: "R2", result: await cf.r2List() },
      { name: "Queues", result: await cf.queueList() },
    ];

    const rows = checks.map((c) => {
      let detail = "ok";
      if (c.result.ok === false) {
        detail = (c.result.error ?? "error").slice(0, 80);
      } else if (typeof c.result.value === "string" && c.result.value.trim()) {
        // wrangler list output — show a short preview
        const preview = c.result.value.replace(/\s+/g, " ").trim();
        detail =
          preview.length > 60 ? `${preview.slice(0, 57)}…` : preview || "ok";
      }
      return {
        Resource: c.name,
        Status: c.result.ok ? "ok" : "fail",
        Detail: detail,
      };
    });

    if (!fmt.quiet) {
      formatTable(rows, { ...fmt, compact: true });
    }

    const failed = checks.filter(
      (c): c is { name: string; result: { ok: false; error: string } } =>
        c.result.ok === false
    );
    if (failed.length === 0) {
      if (!options.provision) {
        formatSuccess(
          "Infrastructure APIs reachable. To create missing bindings: hoox repair infra --provision (or hoox infra provision)",
          fmt
        );
      } else {
        formatSuccess("Infrastructure APIs reachable.", fmt);
      }
    } else {
      formatError(
        new CLIError(
          `${failed.length} infrastructure check(s) failed`,
          ExitCode.ERROR,
          failed
            .map((f) => `${f.name}: ${f.result.error ?? "fail"}`)
            .join("\n"),
          true,
          options.provision
            ? "Check Cloudflare auth (`wrangler whoami`). Provision will still be attempted."
            : "Check Cloudflare auth (`wrangler whoami`), then run `hoox repair infra --provision`."
        ),
        fmt
      );
      process.exitCode = ExitCode.ERROR;
    }

    // --provision: create missing resources via the same path as `hoox infra provision`
    if (options.provision) {
      const infraOpts = { json: fmt.json, quiet: fmt.quiet };
      if (options.dryRun) {
        await doProvisionDryRun(infraOpts);
      } else {
        const result = await doProvision(infraOpts);
        if (result.summary.errors > 0) {
          process.exitCode = ExitCode.ERROR;
        }
      }
    }
  } catch (err) {
    formatError(err instanceof Error ? err : String(err), fmt);
    process.exitCode = ExitCode.ERROR;
  }
}

async function handleSecrets(fmt: FormatOptions): Promise<void> {
  try {
    const secrets = await SecretsService.create();
    const allSecrets = secrets.listAllSecrets();
    const workers = Object.keys(allSecrets);
    if (workers.length === 0) {
      formatSuccess("No workers with declared secrets", fmt);
      return;
    }

    let totalSynced = 0;
    let workersFailed = 0;
    const issues: string[] = [];

    for (const name of workers) {
      const result = await secrets.syncToCloudflare(name, { systemOnly: true });
      if (!result.ok) {
        workersFailed++;
        issues.push(`${name}: ${result.error}`);
        continue;
      }
      const sync = result.value!;
      totalSynced += sync.synced.length;
      if (!sync.ok) {
        workersFailed++;
        for (const f of sync.failed) {
          issues.push(`${name}/${f.name}: ${f.reason}`);
        }
        for (const s of sync.skipped) {
          issues.push(`${name}/${s.name}: ${s.reason}`);
        }
      }
    }

    if (workersFailed === 0) {
      formatSuccess(
        `Repaired system secrets: ${totalSynced} put across ${workers.length} worker(s)`,
        fmt
      );
    } else {
      formatError(
        new CLIError(
          `System secret repair incomplete (${totalSynced} put, ${workersFailed} worker(s) with issues)`,
          ExitCode.ERROR,
          issues.slice(0, 15).join("\n"),
          true,
          "Run `hoox keys generate` then `hoox secrets sync --system`, or fill workers/*/.dev.vars."
        ),
        fmt
      );
      process.exitCode = ExitCode.ERROR;
    }
  } catch (err) {
    formatError(err instanceof Error ? err : String(err), fmt);
    process.exitCode = ExitCode.ERROR;
  }
}

async function handleKv(fmt: FormatOptions): Promise<void> {
  try {
    const kv = new KvSyncService();
    const nsId = await kv.resolveNamespaceId();
    formatSuccess(`KV namespace resolved: ${nsId}`, fmt);
  } catch (err) {
    formatError(err instanceof Error ? err : String(err), fmt);
    process.exitCode = ExitCode.ERROR;
  }
}

async function handleDb(fmt: FormatOptions): Promise<void> {
  try {
    const svc = new DbService();
    const dbName = await svc.resolveDbName();
    await svc.apply(dbName, false);
    formatSuccess(`DB "${dbName}" re-applied`, fmt);
  } catch (err) {
    formatError(err instanceof Error ? err : String(err), fmt);
    process.exitCode = ExitCode.ERROR;
  }
}

async function handleRebuild(fmt: FormatOptions): Promise<void> {
  try {
    const repair = new RepairService();
    const result = await repair.runSystemCheck();
    if (!result.allPassed) {
      formatError(
        new CLIError(
          `${result.failedCount} check(s) failed — aborting rebuild`,
          ExitCode.ERROR
        ),
        fmt
      );
      process.exitCode = ExitCode.ERROR;
      return;
    }
    const cf = new CloudflareService();
    const { ConfigService } = await import("../../services/config/index.js");
    const config = new ConfigService();
    await config.load();
    for (const worker of config.listEnabledWorkers()) {
      const cfg = config.getWorker(worker);
      if (cfg) {
        await cf.deploy(cfg.path);
      }
    }
    formatSuccess("Rebuild complete", fmt);
  } catch (err) {
    formatError(err instanceof Error ? err : String(err), fmt);
    process.exitCode = ExitCode.ERROR;
  }
}

export function registerRepairCommand(program: Command): void {
  const repairCmd = program
    .command("repair")
    .summary("Diagnose and repair the Hoox system")
    .description(
      "Run checks, deploy workers, or fix infrastructure, secrets, KV, and DB issues."
    );

  repairCmd
    .command("check")
    .description(
      "Run system diagnostics (workers, types, infra, secrets). Does not run bun install unless --install-deps."
    )
    .option(
      "--install-deps",
      "Also run `bun install` as a check step (side-effectful; off by default)"
    )
    .option("--no-typecheck", "Skip the TypeScript typecheck step")
    .action(
      withErrorHandling(
        async (options: { installDeps?: boolean; typecheck?: boolean }) => {
          const fmt = getFormatOptions(repairCmd);
          await handleCheck(fmt, options);
        },
        { service: "repair" }
      )
    );

  repairCmd
    .command("worker <name>")
    .description("Deploy a specific worker to fix it")
    .action(
      withErrorHandling(
        async (name: string) => {
          const fmt = getFormatOptions(repairCmd);
          await handleWorker(name, fmt);
        },
        { service: "repair" }
      )
    );

  repairCmd
    .command("infra")
    .description(
      "Diagnose Cloudflare infrastructure (D1, KV, R2, Queues). Pass --provision to also create missing resources from wrangler.jsonc (same as `hoox infra provision`)."
    )
    .option(
      "--provision",
      "After diagnosis, provision missing D1/KV/R2/Queues from worker wrangler.jsonc files"
    )
    .option(
      "--dry-run",
      "With --provision, preview resources that would be created without creating them"
    )
    .action(
      withErrorHandling(
        async (options: { provision?: boolean; dryRun?: boolean }) => {
          const fmt = getFormatOptions(repairCmd);
          await handleInfra(fmt, options);
        },
        { service: "repair" }
      )
    );

  repairCmd
    .command("secrets")
    .description(
      "Upload system/mesh secrets from .dev.vars to Cloudflare (same as `hoox secrets sync --system`)"
    )
    .action(
      withErrorHandling(
        async () => {
          const fmt = getFormatOptions(repairCmd);
          await handleSecrets(fmt);
        },
        { service: "repair" }
      )
    );

  repairCmd
    .command("kv")
    .description("Re-sync KV namespace entries")
    .action(
      withErrorHandling(
        async () => {
          const fmt = getFormatOptions(repairCmd);
          await handleKv(fmt);
        },
        { service: "repair" }
      )
    );

  repairCmd
    .command("db")
    .description("Re-apply database schema")
    .action(
      withErrorHandling(
        async () => {
          const fmt = getFormatOptions(repairCmd);
          await handleDb(fmt);
        },
        { service: "repair" }
      )
    );

  repairCmd
    .command("rebuild")
    .description(
      "Full rebuild: check, deploy all workers, fix infra/secrets/db"
    )
    .action(
      withErrorHandling(
        async () => {
          const fmt = getFormatOptions(repairCmd);
          await handleRebuild(fmt);
        },
        { service: "repair" }
      )
    );
}
