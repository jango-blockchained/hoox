/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `hoox doctor` — diagnose global runtime / toolchain layout.
 *
 * Reports $HOME/.hoox, local vs global monorepo resolution, and TUI entry.
 * With `--fix-runtime`, clones hoox-setup into ~/.hoox/repo and installs deps.
 * With `--security`, runs operator-plane hygiene + optional /v1/health probes.
 */
import { Command } from "commander";
import { spinner } from "@clack/prompts";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  resolveOperatorTransportProfile,
  type OperatorTransportEnv,
} from "@hoox-sh/hoox-shared";
import {
  ensureGlobalRuntime,
  getRuntimeStatus,
} from "../../services/runtime/index.js";
import {
  collectSecurityHygiene,
  formatProbeSecurityLines,
  probeOperatorManagement,
  securityChecksFailed,
  type SecurityCheckLine,
} from "../../services/operator-security/index.js";
import { theme, icons } from "../../utils/theme.js";
import {
  formatJson,
  formatSuccess,
  getFormatOptions,
} from "../../utils/formatters.js";
import { CLIError, ExitCode } from "../../utils/errors.js";
import { withErrorHandling } from "../../utils/error-handler.js";
import { startTimer } from "../../utils/timer.js";
import { formatDuration } from "../../utils/formatters.js";

function printCheckIcon(severity: SecurityCheckLine["severity"]): string {
  switch (severity) {
    case "ok":
      return theme.success(icons.success);
    case "warn":
      return theme.warning(icons.warning);
    case "error":
      return theme.error(icons.error);
    default:
      return theme.dim("·");
  }
}

function printStatus(): number {
  const status = getRuntimeStatus();
  const { runtime } = status;

  process.stdout.write(theme.heading("\nHoox doctor\n\n"));
  process.stdout.write(
    `${theme.dim("HOOX_HOME")}     ${status.hooxHome}\n` +
      `${theme.dim("Global repo")}  ${status.repoPath}\n` +
      `${theme.dim("Runtime root")} ${runtime.root ?? theme.warning("(none)")}\n` +
      `${theme.dim("Source")}       ${runtime.source}\n` +
      `${theme.dim("TUI entry")}    ${status.tuiEntry ?? theme.warning("(not found)")}\n\n`
  );

  // Global clone is optional when cwd / HOOX_REPO already resolves a monorepo.
  const globalRequired = runtime.root === null;
  const lines: {
    ok: boolean;
    required: boolean;
    label: string;
    detail?: string;
  }[] = [
    {
      ok: true,
      required: true,
      label: "Hoox home path",
      detail: status.hooxHome,
    },
    {
      ok: status.isSetupRoot,
      required: globalRequired,
      label: "Global runtime (~/.hoox/repo)",
      detail: status.isSetupRoot
        ? "monorepo markers present"
        : status.repoPresent
          ? "path exists but is not a setup monorepo"
          : runtime.root
            ? "optional (runtime resolved elsewhere)"
            : "missing — run: hoox doctor --fix-runtime",
    },
    {
      ok: runtime.root !== null,
      required: true,
      label: "Resolved runtime root",
      detail:
        runtime.root === null
          ? "set HOOX_REPO, cd into hoox-setup, or fix-runtime"
          : `${runtime.source}: ${runtime.root}`,
    },
    {
      ok: status.tuiEntry !== null,
      required: true,
      label: "TUI entry point",
      detail:
        status.tuiEntry ?? "packages/tui/src/main.tsx not found under runtime",
    },
  ];

  let failed = 0;
  for (const line of lines) {
    const warnOnly = !line.ok && !line.required;
    const icon = line.ok
      ? theme.success(icons.success)
      : warnOnly
        ? theme.warning(icons.warning)
        : theme.error(icons.error);
    if (!line.ok && line.required) failed++;
    process.stdout.write(`${icon} ${line.label}\n`);
    if (line.detail) {
      process.stdout.write(`   ${theme.dim(line.detail)}\n`);
    }
  }
  process.stdout.write("\n");

  // Lightweight security hygiene — never print secret values.
  printSecurityHygieneSection();

  if (failed > 0 || !status.isSetupRoot) {
    process.stdout.write(
      theme.dim(
        "Tip: HOOX_HOME overrides ~/.hoox · HOOX_REPO forces the monorepo path\n" +
          "     Lightweight TUI:    bun add -g @hoox-sh/hoox-tui\n" +
          "     Full runtime:       hoox doctor --fix-runtime\n" +
          "     Operator plane:     hoox doctor --security\n\n"
      )
    );
  }

  return failed === 0 ? ExitCode.SUCCESS : ExitCode.ERROR;
}

function printSecurityHygieneSection(
  env: NodeJS.ProcessEnv = process.env
): void {
  const configPath = join(homedir(), ".hoox", "config.json");
  const lines = collectSecurityHygiene(env, { configPath });
  process.stdout.write(theme.heading("Security hygiene\n"));
  for (const line of lines) {
    process.stdout.write(
      `${printCheckIcon(line.severity)} ${line.label}\n` +
        `   ${theme.dim(line.detail)}\n`
    );
  }
  process.stdout.write("\n");
}

async function runSecurityDoctor(options: {
  apiUrl?: string;
  probe?: boolean;
  json?: boolean;
}): Promise<number> {
  const env = { ...process.env } as OperatorTransportEnv;
  if (options.apiUrl) {
    env.HOOX_API_URL = options.apiUrl;
  }
  const profile = resolveOperatorTransportProfile(env);
  const configPath = join(homedir(), ".hoox", "config.json");
  const hygiene = collectSecurityHygiene(env, { configPath });

  const isLocal =
    profile.apiBase.includes("localhost") ||
    profile.apiBase.includes("127.0.0.1");
  const shouldProbe =
    options.probe === true || (options.probe !== false && !isLocal);

  let probeLines: SecurityCheckLine[] = [];
  let anonymous;
  let authed;

  if (shouldProbe) {
    anonymous = await probeOperatorManagement({
      profile,
      anonymous: true,
    });
    authed = await probeOperatorManagement({ profile });
    probeLines = formatProbeSecurityLines(authed, anonymous, profile);
  }

  const all = [...hygiene, ...probeLines];

  if (options.json) {
    formatJson(
      {
        transport: profile.transport,
        apiBase: profile.apiBase,
        hygiene,
        probe: shouldProbe ? { anonymous, authed } : null,
        failed: securityChecksFailed(all),
      },
      { json: true, quiet: false }
    );
    return securityChecksFailed(all) ? ExitCode.ERROR : ExitCode.SUCCESS;
  }

  process.stdout.write(theme.heading("\nHoox doctor — security\n\n"));
  process.stdout.write(
    theme.dim(`Transport ${profile.transport} · API ${profile.apiBase}\n\n`)
  );

  process.stdout.write(theme.heading("Hygiene\n"));
  for (const line of hygiene) {
    process.stdout.write(
      `${printCheckIcon(line.severity)} ${line.label}\n` +
        `   ${theme.dim(line.detail)}\n`
    );
  }
  process.stdout.write("\n");

  if (shouldProbe) {
    process.stdout.write(theme.heading("Management probes\n"));
    for (const line of probeLines) {
      process.stdout.write(
        `${printCheckIcon(line.severity)} ${line.label}\n` +
          `   ${theme.dim(line.detail)}\n`
      );
    }
    process.stdout.write("\n");
  } else {
    process.stdout.write(
      theme.dim(
        "Probes skipped (local API). Use --probe or --api-url https://mgmt…\n\n"
      )
    );
  }

  process.stdout.write(
    theme.dim(
      "Next: hoox tunnel check · docs/devops/deployment/private-ingress.mdx\n\n"
    )
  );

  return securityChecksFailed(all) ? ExitCode.ERROR : ExitCode.SUCCESS;
}

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .summary("Diagnose global runtime, TUI paths, and operator security")
    .description(
      `Check Hoox path layout: $HOME/.hoox, local monorepo detection, and TUI entry.

Resolution order for the tool/runtime root:
  1. HOOX_REPO environment variable
  2. Walk up from the current directory for a hoox monorepo checkout
  3. $HOME/.hoox/repo (managed global clone of github.com/hoox-sh/hoox)

TUI (outside a monorepo) — preferred lightweight path:
  bun add -g @hoox-sh/hoox-tui

SECURITY:
  hoox doctor --security   Hygiene + optional /v1/health probes (Access / Bearer)

EXAMPLES:
  hoox doctor
  hoox doctor --fix-runtime   Clone monorepo + bun install into ~/.hoox/repo
  hoox doctor --security
  hoox doctor --security --api-url https://mgmt.example.com
  HOOX_REPO=~/Git/hoox hoox doctor`
    )
    .option(
      "--fix-runtime",
      "Clone the Hoox monorepo into ~/.hoox/repo and install dependencies"
    )
    .option("--repo-url <url>", "Git URL used with --fix-runtime", undefined)
    .option(
      "--security",
      "Operator-plane security hygiene + optional management probes"
    )
    .option(
      "--api-url <url>",
      "Management API base for --security probes (sets HOOX_API_URL for the check)"
    )
    .option("--probe", "Force /v1/health probes even for localhost")
    .option("--no-probe", "Skip network probes with --security")
    .action(
      withErrorHandling(
        async (
          options: {
            fixRuntime?: boolean;
            repoUrl?: string;
            security?: boolean;
            apiUrl?: string;
            probe?: boolean;
          },
          cmd: Command
        ) => {
          const fmt = getFormatOptions(cmd);

          if (options.security) {
            process.exitCode = await runSecurityDoctor({
              apiUrl: options.apiUrl,
              probe: options.probe,
              json: fmt.json,
            });
            return;
          }

          if (options.fixRuntime) {
            const s = spinner();
            const t = startTimer();
            s.start("Ensuring global Hoox runtime...");
            try {
              const result = await ensureGlobalRuntime({
                repoUrl: options.repoUrl,
                onLog: (msg) => {
                  s.message(msg);
                },
              });
              const dur = formatDuration(t.ms());
              s.stop(
                theme.success(
                  `Runtime ready at ${result.repoPath} (${dur})` +
                    (result.cloned ? " [cloned]" : "") +
                    (result.installed ? " [installed]" : "")
                )
              );
              if (fmt.json) {
                formatJson({ ...result, status: getRuntimeStatus() }, fmt);
              } else {
                formatSuccess(
                  result.tuiEntry
                    ? `TUI entry: ${result.tuiEntry}`
                    : "Runtime installed (TUI entry not found — check packages/tui)"
                );
                printStatus();
              }
              if (!result.tuiEntry) {
                process.exitCode = ExitCode.ERROR;
              }
            } catch (err) {
              s.stop(theme.error("Failed to fix runtime"));
              throw new CLIError(
                err instanceof Error ? err.message : String(err),
                ExitCode.ERROR
              );
            }
            return;
          }

          if (fmt.json) {
            formatJson(getRuntimeStatus(), fmt);
            const status = getRuntimeStatus();
            if (!status.runtime.root || !status.tuiEntry) {
              process.exitCode = ExitCode.ERROR;
            }
            return;
          }

          process.exitCode = printStatus();
        },
        { service: "doctor" }
      )
    );
}
