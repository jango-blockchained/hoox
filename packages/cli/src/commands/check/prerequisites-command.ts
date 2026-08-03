/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from "commander";
import { PrerequisitesService } from "../../services/prerequisites/index.js";
import type { PrerequisitesReport } from "../../services/prerequisites/prerequisites-service.js";
import { theme, icons } from "../../utils/theme.js";
import {
  getFormatOptions,
  formatError,
  formatJson,
} from "../../utils/formatters.js";
import { CLIError, ExitCode } from "../../utils/errors.js";
import { withErrorHandling } from "../../utils/error-handler.js";
import type { FormatOptions } from "../../utils/formatters.js";

export async function runPrerequisitesCheck(
  service?: PrerequisitesService
): Promise<PrerequisitesReport> {
  const svc = service ?? new PrerequisitesService();
  return await svc.runAll();
}

function renderReport(report: PrerequisitesReport): void {
  for (const check of report.checks) {
    const icon = check.passed
      ? theme.success(icons.success)
      : theme.error(icons.error);
    process.stdout.write(`${icon} ${check.name}\n`);
    process.stdout.write(`   ${theme.dim("Version:")} ${check.version}\n`);
    process.stdout.write(`   ${theme.dim("Required:")} ${check.required}\n`);
    if (check.hint) {
      process.stdout.write(
        `   ${theme.warning(`${icons.warning} ${check.hint}`)}\n`
      );
    }
    process.stdout.write("\n");
  }

  const summary = report.allPassed
    ? `${theme.success(icons.success)} All prerequisites met`
    : `${theme.error(icons.error)} Some prerequisites not met`;
  process.stdout.write(summary + "\n");
}

async function handlePrerequisites(
  opts: FormatOptions,
  tool?: string
): Promise<void> {
  try {
    const svc = new PrerequisitesService();
    const report = tool ? await svc.runAll(tool) : await svc.runAll();

    if (opts.json) {
      formatJson(report, opts);
    } else if (opts.quiet) {
      // quiet mode — no output
    } else {
      renderReport(report);
    }

    if (!report.allPassed) {
      process.exitCode = ExitCode.ERROR;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    formatError(new CLIError(message, ExitCode.ERROR), opts);
    process.exitCode = ExitCode.ERROR;
  }
}

export function registerPrerequisitesCommand(parentCmd: Command): void {
  parentCmd
    .command("prerequisites")
    .summary("Validate toolchain and account prerequisites")
    .description(
      `Check that all required tools and accounts are set up correctly.

Checks performed:
  1. Bun version (>=1.2)
  2. Git version (>=2.40)
  3. Node.js version (>=18, advisory)
  4. Wrangler CLI version (latest)
  5. Cloudflare authentication
  6. Docker availability (advisory)
  7. Repository integrity (wrangler.jsonc, submodules)

OPTIONS:
  --tool <name>    Only check a specific tool (e.g. "bun", "git", "wrangler")

EXAMPLES:
  hoox check prerequisites
  hoox check prerequisites --tool bun
  hoox check prerequisites --json`
    )
    .option("--tool <name>", "Only check a specific tool")
    .action(
      withErrorHandling(
        async (options: { tool?: string }, cmd: Command) => {
          const opts = getFormatOptions(cmd);
          await handlePrerequisites(opts, options.tool);
        },
        { service: "check" }
      )
    );
}
