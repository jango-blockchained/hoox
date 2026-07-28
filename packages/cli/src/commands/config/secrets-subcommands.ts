/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared secrets subcommand registration for:
 *   - `hoox config secrets …`
 *   - `hoox secrets …` (top-level alias, in-process — no PATH re-spawn)
 */
import type { Command } from "commander";
import { spinner } from "@clack/prompts";

import {
  SecretsService,
  type SecretSyncResult,
} from "../../services/secrets/index.js";
import { CLIError, ExitCode } from "../../utils/errors.js";
import { withErrorHandling } from "../../utils/error-handler.js";
import {
  formatSuccess,
  formatError,
  formatJson,
  formatTable,
  getFormatOptions,
} from "../../utils/formatters.js";
import { theme, icons } from "../../utils/theme.js";
import type { FormatOptions } from "../../utils/formatters.js";
import { sanitizeWranglerOutput } from "../../utils/wrangler-output.js";

/** Render a structured secret-sync result; set exitCode on failure. */
function reportSecretSync(
  result: SecretSyncResult,
  opts: FormatOptions,
  scopeLabel: string
): void {
  const nOk = result.synced.length;
  const nSkip = result.skipped.length;
  const nFail = result.failed.length;

  if (opts.json) {
    formatJson(
      {
        worker: result.worker,
        ok: result.ok,
        synced: result.synced,
        skipped: result.skipped,
        failed: result.failed,
      },
      opts
    );
  } else if (!opts.quiet && result.items.length > 0) {
    formatTable(
      result.items.map((i) => ({
        Secret: i.name,
        Status: i.status,
        Detail: i.reason ?? "—",
      })),
      { ...opts, compact: true }
    );
  }

  if (result.ok) {
    formatSuccess(
      nOk === 0 && nSkip === 0
        ? `No ${scopeLabel} to sync for ${result.worker}`
        : `Synced ${nOk} ${scopeLabel} for ${result.worker}` +
            (nSkip > 0 ? ` (${nSkip} skipped)` : ""),
      opts
    );
    return;
  }

  const detailParts: string[] = [];
  for (const f of result.failed) {
    detailParts.push(`✗ ${f.name}: ${f.reason ?? "failed"}`);
  }
  for (const s of result.skipped) {
    detailParts.push(`· ${s.name}: ${s.reason ?? "skipped"}`);
  }

  formatError(
    new CLIError(
      `Secret sync incomplete for ${result.worker}: ${nOk} synced, ${nSkip} skipped, ${nFail} failed`,
      ExitCode.ERROR,
      detailParts.join("\n") || undefined,
      true,
      nFail > 0
        ? "Fix wrangler config / auth, then re-run. Use `hoox secrets sync --system` after key rotation."
        : "Fill missing values in workers/*/.dev.vars (or `hoox keys generate`), then re-run. Prefer `hoox secrets sync --system` for mesh keys only."
    ),
    opts
  );
  process.exitCode = ExitCode.ERROR;
}

/**
 * Prompt the user for a secret value via stdin (password-style masked input).
 */
async function promptSecret(promptText: string): Promise<string> {
  process.stdout.write(`${theme.info(icons.info)} ${promptText}: `);

  if (process.stdin.isTTY) {
    let prevRaw = false;
    try {
      prevRaw =
        (
          process.stdin as unknown as { isRawMode?: () => boolean }
        ).isRawMode?.() ?? false;
    } catch {
      // isRawMode not available
    }
    try {
      if (process.stdin.setRawMode) process.stdin.setRawMode(true);
    } catch {
      // Raw mode not supported
    }

    let input = "";
    try {
      for await (const chunk of Bun.stdin.stream() as unknown as AsyncIterable<Uint8Array>) {
        const text = new TextDecoder().decode(chunk);
        for (const char of text) {
          if (char === "\n" || char === "\r") {
            process.stdout.write("\n");
            return input;
          }
          if (char === "\x03") {
            process.stdout.write("\n");
            throw new CLIError("Operation cancelled", ExitCode.INVALID_USAGE);
          }
          if (char === "\x7f") {
            if (input.length > 0) {
              input = input.slice(0, -1);
              process.stdout.write("\b \b");
            }
          } else if (char >= "\x20") {
            input += char;
            process.stdout.write("*");
          }
        }
      }
    } finally {
      try {
        if (process.stdin.setRawMode) process.stdin.setRawMode(prevRaw);
      } catch {
        // ignore
      }
    }
    return input;
  }

  return await readLine();
}

async function readLine(): Promise<string> {
  let line = "";
  for await (const chunk of Bun.stdin.stream() as unknown as AsyncIterable<Uint8Array>) {
    const text = new TextDecoder().decode(chunk);
    const newlineIdx = text.indexOf("\n");
    if (newlineIdx >= 0) {
      line += text.substring(0, newlineIdx);
      break;
    }
    line += text;
  }
  return line.trim();
}

async function updateDevVars(
  filePath: string,
  key: string,
  value: string
): Promise<void> {
  const file = Bun.file(filePath);
  if (await file.exists()) {
    const content = await file.text();
    const lines = content.split("\n");
    const updated: string[] = [];
    let found = false;

    for (const line of lines) {
      if (line.startsWith(`${key}=`)) {
        updated.push(`${key}=${value}`);
        found = true;
      } else {
        updated.push(line);
      }
    }

    if (!found) {
      updated.push(`${key}=${value}`);
    }

    while (updated.length > 0 && updated[updated.length - 1] === "") {
      updated.pop();
    }

    await Bun.write(filePath, updated.join("\n") + "\n");
  } else {
    await Bun.write(filePath, `${key}=${value}\n`);
  }
}

/**
 * Attach list / set / delete / sync under a parent command
 * (either `config secrets` or top-level `secrets`).
 */
export function registerSecretsSubcommands(
  secretsCmd: Command,
  service = "config"
): void {
  secretsCmd
    .command("list [worker]")
    .summary("List secrets for all workers or a specific worker")
    .description(
      `List the secrets declared in wrangler.jsonc for workers.

ARGUMENTS:
  worker    Optional worker name to filter by

EXAMPLES:
  hoox secrets list
  hoox secrets list trade-worker
  hoox config secrets list trade-worker`
    )
    .action(
      withErrorHandling(
        async (worker: string | undefined, _, cmd: Command) => {
          const opts = getFormatOptions(cmd);
          const svc = await SecretsService.create();

          if (worker) {
            const secrets = svc.listSecrets(worker);
            if (secrets.length === 0) {
              process.stdout.write(
                `${theme.dim(`No secrets declared for worker "${worker}".`)}\n`
              );
              return;
            }

            if (opts.json) {
              formatJson({ worker, secrets }, opts);
            } else {
              process.stdout.write(
                `${theme.heading(`\nSecrets for ${worker}`)}\n`
              );
              for (const s of secrets) {
                process.stdout.write(`  ${theme.label("•")} ${s}\n`);
              }
            }
          } else {
            const all = svc.listAllSecrets();
            const workers = Object.keys(all);

            if (workers.length === 0) {
              process.stdout.write(
                `${theme.dim("No secrets declared for any worker.")}\n`
              );
              return;
            }

            if (opts.json) {
              formatJson(all, opts);
            } else {
              process.stdout.write(`${theme.heading("\nSecrets by Worker")}\n`);
              for (const [name, secrets] of Object.entries(all)) {
                process.stdout.write(
                  `\n  ${theme.bold(name)} (${secrets.length})\n`
                );
                for (const s of secrets) {
                  process.stdout.write(`    ${theme.dim("•")} ${s}\n`);
                }
              }
            }
          }
        },
        { service }
      )
    );

  secretsCmd
    .command("set <worker> <name>")
    .summary("Set a secret value for a worker")
    .description(
      `Set a secret value for a worker and sync to Cloudflare.

ARGUMENTS:
  worker    Worker name (e.g., trade-worker, agent-worker)
  name      Secret name (must be declared in wrangler.jsonc)

The command will prompt for the secret value (hidden input).
It writes to the worker's .dev.vars file and syncs to Cloudflare.

EXAMPLES:
  hoox secrets set trade-worker BINANCE_KEY_BINDING
  hoox config secrets set trade-worker BINANCE_KEY_BINDING`
    )
    .action(
      withErrorHandling(
        async (workerName: string, secretName: string, _, cmd: Command) => {
          const opts = getFormatOptions(cmd);
          const svc = await SecretsService.create();
          const declared = svc.listSecrets(workerName);

          if (!declared.includes(secretName) && declared.length > 0) {
            throw new CLIError(
              `Secret "${secretName}" is not declared for worker "${workerName}". ` +
                `Declared secrets: ${declared.join(", ")}`,
              ExitCode.INVALID_USAGE
            );
          }

          const value = await promptSecret(`Enter value for "${secretName}"`);
          if (!value) {
            throw new CLIError(
              "Secret value cannot be empty",
              ExitCode.INVALID_USAGE
            );
          }

          const devVarsPath = `workers/${workerName}/.dev.vars`;
          await updateDevVars(devVarsPath, secretName, value);

          formatSuccess(
            `Secret "${secretName}" updated in ${devVarsPath}`,
            opts
          );

          const syncSpin = spinner();
          syncSpin.start("Syncing to Cloudflare...");
          const result = await svc.syncToCloudflare(workerName);
          if (!result.ok) {
            syncSpin.stop(`Sync failed: ${result.error ?? "unknown error"}`);
            formatError(
              new CLIError(
                `Sync failed: ${result.error ?? "unknown error"}`,
                ExitCode.ERROR,
                undefined,
                true,
                "Check wrangler.jsonc exists and the worker path is correct."
              ),
              opts
            );
            process.exitCode = ExitCode.ERROR;
            return;
          }
          const sync = result.value!;
          if (sync.synced.includes(secretName)) {
            syncSpin.stop(`Secret "${secretName}" synced to Cloudflare`);
          } else if (sync.failed.some((f) => f.name === secretName)) {
            const fr = sync.failed.find((f) => f.name === secretName);
            syncSpin.stop(`Sync failed for "${secretName}"`);
            formatError(
              new CLIError(
                `Failed to put secret "${secretName}" on Cloudflare`,
                ExitCode.ERROR,
                fr?.reason,
                true,
                "Check Cloudflare auth (`wrangler whoami`) and worker wrangler.jsonc."
              ),
              opts
            );
            process.exitCode = ExitCode.ERROR;
          } else {
            syncSpin.stop(
              `Secret written locally; Cloudflare put skipped or partial for "${secretName}"`
            );
          }
        },
        { service }
      )
    );

  secretsCmd
    .command("delete <worker> <name>")
    .summary("Delete a secret from Cloudflare")
    .description(
      `Delete a secret from Cloudflare Workers.

ARGUMENTS:
  worker    Worker name (e.g., trade-worker, agent-worker)
  name      Secret name to delete

This removes the secret from Cloudflare and from the worker's .dev.vars file.

EXAMPLES:
  hoox secrets delete trade-worker BINANCE_KEY_BINDING
  hoox config secrets delete trade-worker BINANCE_KEY_BINDING`
    )
    .action(
      withErrorHandling(
        async (workerName: string, secretName: string, _, cmd: Command) => {
          const opts = getFormatOptions(cmd);
          const svc = await SecretsService.create();
          const declared = svc.listSecrets(workerName);

          if (!declared.includes(secretName)) {
            throw new CLIError(
              `Secret "${secretName}" is not declared for worker "${workerName}".`,
              ExitCode.INVALID_USAGE
            );
          }

          const proc = Bun.spawn(["wrangler", "secret", "delete", secretName], {
            cwd: `workers/${workerName}`,
            stdout: "pipe",
            stderr: "pipe",
          });

          const exitCode = await proc.exited;
          if (exitCode !== 0) {
            const stderrText = await new Response(proc.stderr).text();
            throw new CLIError(
              `Failed to delete secret "${secretName}" (wrangler exit ${exitCode})`,
              ExitCode.ERROR,
              sanitizeWranglerOutput(stderrText),
              true,
              "Check Cloudflare auth and that the secret exists on the worker."
            );
          }

          const devVarsPath = `workers/${workerName}/.dev.vars`;
          const devFile = Bun.file(devVarsPath);
          if (await devFile.exists()) {
            const content = await devFile.text();
            const lines = content.split("\n");
            const filtered = lines.filter(
              (line) => !line.startsWith(`${secretName}=`) && line.trim() !== ""
            );
            await Bun.write(
              devVarsPath,
              filtered.join("\n") + (filtered.length > 0 ? "\n" : "")
            );
          }

          formatSuccess(`Secret "${secretName}" deleted from Cloudflare`, opts);
        },
        { service }
      )
    );

  secretsCmd
    .command("sync [worker]")
    .summary("Sync secrets to Cloudflare")
    .description(
      `Sync secrets from .dev.vars files to Cloudflare Workers.

ARGUMENTS:
  worker    Optional worker name to sync (syncs all if not specified)

OPTIONS:
  --system, --required
            Only sync system/mesh secrets (INTERNAL_KEY_BINDING,
            WEBHOOK_API_KEY_BINDING, AGENT_INTERNAL_KEY, SESSION_SECRET, …).
            Skips exchange keys, bot tokens, and other integration secrets.
            Recommended after \`hoox keys generate\` or key rotation.

This reads .dev.vars files and uploads secrets to Cloudflare via wrangler.

EXAMPLES:
  hoox secrets sync --system
  hoox secrets sync trade-worker --required
  hoox secrets sync
  hoox secrets sync trade-worker
  hoox config secrets sync trade-worker`
    )
    .option(
      "--system",
      "Only sync system/mesh secrets (internal keys, webhook, session)"
    )
    .option(
      "--required",
      "Alias for --system (mesh secrets required for workers to operate)"
    )
    .action(
      withErrorHandling(
        async (
          workerName: string | undefined,
          options: { system?: boolean; required?: boolean },
          cmd: Command
        ) => {
          const opts = getFormatOptions(cmd);
          // Prefer action options object; fall back to cmd.opts() for safety.
          const flagOpts = {
            ...cmd.opts<{ system?: boolean; required?: boolean }>(),
            ...options,
          };
          const systemOnly = Boolean(flagOpts.system || flagOpts.required);
          const syncOpts = { systemOnly };
          const scopeLabel = systemOnly ? "system secret(s)" : "secret(s)";
          const svc = await SecretsService.create();

          if (workerName) {
            const syncSpin = spinner();
            syncSpin.start(`Syncing ${scopeLabel} for "${workerName}"...`);
            const result = await svc.syncToCloudflare(workerName, syncOpts);
            if (!result.ok) {
              syncSpin.stop(`Sync failed: ${result.error ?? "unknown error"}`);
              formatError(
                new CLIError(
                  `Sync failed: ${result.error ?? "unknown error"}`,
                  ExitCode.ERROR,
                  undefined,
                  true,
                  "Ensure wrangler.jsonc exists at the monorepo root."
                ),
                opts
              );
              process.exitCode = ExitCode.ERROR;
              return;
            }
            const n = result.value!.synced.length;
            syncSpin.stop(
              result.value!.ok
                ? `Synced ${n} ${scopeLabel} for "${workerName}"`
                : `Partial sync for "${workerName}" (${n} ok)`
            );
            reportSecretSync(result.value!, opts, scopeLabel);
          } else {
            // Include every worker that declares secrets; under --system also
            // walk all configured workers so mesh keys in .dev.vars are found.
            const all = svc.listAllSecrets();
            let workers = Object.keys(all);
            if (systemOnly && workers.length === 0) {
              formatSuccess("No workers with secrets in wrangler.jsonc.", opts);
              return;
            }
            if (workers.length === 0) {
              formatSuccess("No secrets to sync.", opts);
              return;
            }

            let workersOk = 0;
            let workersFailed = 0;
            let totalSecrets = 0;
            const syncSpin = spinner();
            const failures: string[] = [];

            for (const name of workers) {
              syncSpin.start(`Syncing ${name}...`);
              const result = await svc.syncToCloudflare(name, syncOpts);
              if (!result.ok) {
                syncSpin.stop(`${theme.error("failed")} ${name}`);
                workersFailed++;
                failures.push(`${name}: ${result.error}`);
                continue;
              }
              const sync = result.value!;
              totalSecrets += sync.synced.length;
              if (sync.ok) {
                if (systemOnly && sync.synced.length === 0) {
                  syncSpin.stop(
                    `${theme.dim("skip")} ${name} (no system secrets)`
                  );
                } else {
                  syncSpin.stop(
                    `${theme.success("synced")} ${sync.synced.length} for ${name}`
                  );
                }
                workersOk++;
              } else {
                syncSpin.stop(
                  `${theme.error("partial")} ${name} (${sync.synced.length} ok, ${sync.failed.length + sync.skipped.length} issues)`
                );
                workersFailed++;
                for (const f of sync.failed) {
                  failures.push(`${name}/${f.name}: ${f.reason}`);
                }
                for (const s of sync.skipped) {
                  failures.push(`${name}/${s.name}: ${s.reason}`);
                }
              }
            }

            if (workersFailed === 0) {
              formatSuccess(
                systemOnly
                  ? `Synced ${totalSecrets} system secret(s) across ${workersOk} worker(s)`
                  : `All ${workersOk} workers synced successfully (${totalSecrets} secrets)`,
                opts
              );
            } else {
              formatError(
                new CLIError(
                  `Secret sync finished with issues: ${workersOk} worker(s) ok, ${workersFailed} with problems (${totalSecrets} secrets put)`,
                  ExitCode.ERROR,
                  failures.slice(0, 20).join("\n") +
                    (failures.length > 20
                      ? `\n… and ${failures.length - 20} more`
                      : ""),
                  true,
                  systemOnly
                    ? "Fill mesh keys via `hoox keys generate`, then `hoox secrets sync --system`."
                    : "Use `hoox secrets sync --system` to push only mesh keys, or fill placeholders in .dev.vars."
                ),
                opts
              );
              process.exitCode = ExitCode.ERROR;
            }
          }
        },
        { service }
      )
    );
}
