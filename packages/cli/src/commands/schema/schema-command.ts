/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolve } from "path";
import { Command } from "commander";
import { SchemaService } from "../../services/schema/schema-service.js";
import {
  formatSuccess,
  formatError,
  formatKeyValue,
  formatTable,
  getFormatOptions,
} from "../../utils/formatters.js";
import { CLIError, ExitCode } from "../../utils/errors.js";
import { withErrorHandling } from "../../utils/error-handler.js";
import { generateWranglerJsonc, generateDevVars } from "@hoox-sh/hoox-shared";

export function registerSchemaCommand(program: Command): void {
  const schemaCmd = program
    .command("schema")
    .summary("Validate and manage worker configuration")
    .description(
      "Validate, generate, and repair worker wrangler.jsonc against canonical manifests."
    );

  schemaCmd
    .command("validate [worker]")
    .description(
      "Validate worker(s) against manifest (omit worker to validate all)"
    )
    .action(
      withErrorHandling(async (worker?: string) => {
        const fmt = getFormatOptions(schemaCmd);
        const svc = new SchemaService();
        const results = worker
          ? [svc.validateWorker(worker)]
          : svc.validateAll();
        let totalErrors = 0;
        for (const r of results) {
          if (r.passed) {
            formatSuccess(`${r.worker}: ✅ passed`, fmt);
          } else {
            formatError(
              new CLIError(
                `${r.worker}: ❌ failed (${r.errors.length} issues)`,
                ExitCode.ERROR
              ),
              fmt
            );
            for (const e of r.errors.filter((e) => e.severity === "error")) {
              process.stderr.write(`  ✗ ${e.message}\n`);
            }
            totalErrors += r.errors.filter(
              (e) => e.severity === "error"
            ).length;
          }
        }
        if (totalErrors > 0) process.exitCode = ExitCode.ERROR;
      })
    );

  schemaCmd
    .command("list")
    .description("List all workers with their binding counts")
    .action(
      withErrorHandling(async () => {
        const fmt = getFormatOptions(schemaCmd);
        const svc = new SchemaService();
        const rows: Record<string, string>[] = [];
        for (const name of svc.getWorkerNames()) {
          const m = svc.getManifest(name)!;
          const secretCount = Object.values(m.vars).filter(
            (v) => v.type === "secret"
          ).length;
          const svcCount = m.services.length;
          const infraCount = Object.keys(m.infrastructure).length;
          const middleware = m.middleware.length
            ? m.middleware.join(", ")
            : "\u2014";
          rows.push({
            worker: name,
            secrets: String(secretCount),
            services: String(svcCount),
            infra: String(infraCount),
            middleware,
          });
        }
        formatTable(rows, fmt);
      })
    );

  schemaCmd
    .command("generate <worker>")
    .description("Generate wrangler.jsonc and .dev.vars from manifest")
    .option("--dry-run", "Print generated content without writing")
    .action(
      withErrorHandling(async (worker: string, opts: { dryRun?: boolean }) => {
        const fmt = getFormatOptions(schemaCmd);
        const svc = new SchemaService();
        const manifest = svc.getManifest(worker);
        if (!manifest) {
          formatError(
            new CLIError(`Unknown worker "${worker}"`, ExitCode.INVALID_USAGE),
            fmt
          );
          return;
        }

        const wranglerContent = generateWranglerJsonc(manifest);
        const devVarsContent = generateDevVars(manifest);

        if (opts.dryRun) {
          process.stdout.write(`--- wrangler.jsonc (${worker}) ---\n`);
          process.stdout.write(wranglerContent + "\n");
          process.stdout.write(`--- .dev.vars (${worker}) ---\n`);
          process.stdout.write(devVarsContent + "\n");
          return;
        }

        const workersDir = resolve(process.cwd(), "workers", worker);
        const wranglerPath = resolve(workersDir, "wrangler.jsonc");
        const devVarsPath = resolve(workersDir, ".dev.vars");

        await Bun.write(wranglerPath, wranglerContent);
        await Bun.write(devVarsPath, devVarsContent);

        formatKeyValue(
          {
            "wrangler.jsonc": wranglerPath,
            ".dev.vars": devVarsPath,
          },
          { ...fmt, json: false }
        );
        formatSuccess(`Generated files for ${worker}`, fmt);
      })
    );
}
