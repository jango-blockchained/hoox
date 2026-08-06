#!/usr/bin/env bun
/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */
// sync-dashboard-configs.ts
//
// Reads each workers/WORKER/dashboard.jsonc (excluding the dashboard itself),
// validates it against the Zod schema shared with the dashboard loader,
// and writes a copy to workers/dashboard/public/workers/WORKER.jsonc.
//
// Also removes any stale entries in public/workers that no longer have a
// corresponding source (e.g. boilerplate-worker.jsonc from a removed worker).
//
// Run via `bun run sync-dashboard-configs` (wired into `bun run build`).
//
// Exit codes:
//   0 — all files synced (or no changes)
//   1 — at least one file failed Zod validation
//   2 — IO or unexpected error

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import { join, basename } from "node:path";
import { z } from "zod";

// Zod schemas (kept in sync with workers/dashboard/src/lib/settings/loader.ts).
// These are duplicated locally because importing from a Next.js app into a top-level
// script pulls in the React runtime, which we don't want. If the schema changes,
// update both files. The dashboard loader.ts is the source of truth.

const ParsedSectionSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    icon: z.string().optional(),
    priority: z.number().int().nonnegative().optional(),
    fields: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional(),
    options: z
      .record(z.string(), z.array(z.union([z.string(), z.number()])))
      .optional(),
    descriptions: z.record(z.string(), z.string()).optional(),
    // Per-field min/max/pattern for number and text inputs (e.g. cron interval 1–1440).
    validation: z
      .record(
        z.string(),
        z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
            pattern: z.string().optional(),
            required: z.boolean().optional(),
          })
          .strict()
      )
      .optional(),
    secrets: z.record(z.string(), z.boolean()).optional(),
    secret_commands: z.record(z.string(), z.string()).optional(),
  })
  .strict();

const DashboardManifestFileSchema = z
  .object({
    display_name: z.string().optional(),
    displayName: z.string().optional(),
    description: z.string().optional(),
    sections: z.record(z.string(), ParsedSectionSchema).optional(),
  })
  .strict();

// JSONC comment stripper (state machine, not regex).
// Avoids the bug where a naive `//` regex would mangle string values
// containing forward slashes (e.g. URLs in tradingview_allowed_ips).

function stripJsoncComments(input: string): string {
  let out = "";
  let i = 0;
  let inString = false;
  let stringChar = "";
  while (i < input.length) {
    const c = input[i];
    const next = input[i + 1];
    if (inString) {
      out += c;
      if (c === "\\" && i + 1 < input.length) {
        out += next;
        i += 2;
        continue;
      }
      if (c === stringChar) inString = false;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      stringChar = c;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && next === "/") {
      // Line comment — skip to end of line
      while (i < input.length && input[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      // Block comment — skip to */
      i += 2;
      while (i < input.length && !(input[i] === "*" && input[i + 1] === "/"))
        i++;
      i += 2;
      continue;
    }
    // Trailing-comma handling: if we see `,` followed by only whitespace
    // and then `}` or `]`, drop the comma. Must NOT be inside a string.
    if (c === ",") {
      let j = i + 1;
      while (j < input.length && /\s/.test(input[j])) j++;
      if (j < input.length && (input[j] === "}" || input[j] === "]")) {
        i++;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

// ── Sync logic ──

const ROOT = process.cwd();
const WORKERS_DIR = join(ROOT, "workers");
const PUBLIC_DIR = join(ROOT, "workers/dashboard/public/workers");

interface SyncResult {
  worker: string;
  status: "synced" | "unchanged" | "removed" | "error";
  message?: string;
}

function listWorkerNames(): string[] {
  if (!existsSync(WORKERS_DIR)) return [];
  return readdirSync(WORKERS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => name !== "dashboard");
}

function readAndValidate(
  path: string
): { ok: true; data: unknown; raw: string } | { ok: false; error: string } {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    return { ok: false, error: `read failed: ${(err as Error).message}` };
  }
  const stripped = stripJsoncComments(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    return { ok: false, error: `JSON parse failed: ${(err as Error).message}` };
  }
  const result = DashboardManifestFileSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      error: `Zod validation failed: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    };
  }
  return { ok: true, data: result.data, raw };
}

function sync(): SyncResult[] {
  const results: SyncResult[] = [];
  const knownWorkers = new Set<string>();

  for (const worker of listWorkerNames()) {
    const src = join(WORKERS_DIR, worker, "dashboard.jsonc");
    const dst = join(PUBLIC_DIR, `${worker}.jsonc`);
    if (!existsSync(src)) continue; // Worker without a dashboard.jsonc — skip
    knownWorkers.add(`${worker}.jsonc`);

    const result = readAndValidate(src);
    if (!result.ok) {
      results.push({ worker, status: "error", message: result.error });
      continue;
    }
    // Pretty-print with 2-space indent to match existing files; preserve trailing newline
    const output = JSON.stringify(result.data, null, 2) + "\n";
    let prev = "";
    // codeql-disable-next-line js/file-system-race
    try {
      prev = readFileSync(dst, "utf8");
    } catch {
      // dst does not exist or unreadable → will sync
    }
    if (prev === output) {
      results.push({ worker, status: "unchanged" });
    } else {
      try {
        writeFileSync(dst, output, "utf8");
        results.push({ worker, status: "synced" });
      } catch (err) {
        results.push({
          worker,
          status: "error",
          message: `write failed: ${(err as Error).message}`,
        });
      }
    }
  }

  // Remove stale public files (e.g. boilerplate-worker.jsonc)
  // codeql-disable-next-line js/file-system-race
  if (existsSync(PUBLIC_DIR)) {
    for (const file of readdirSync(PUBLIC_DIR)) {
      if (file.endsWith(".jsonc") && !knownWorkers.has(file)) {
        try {
          unlinkSync(join(PUBLIC_DIR, file));
          results.push({ worker: basename(file, ".jsonc"), status: "removed" });
        } catch (err) {
          results.push({
            worker: basename(file, ".jsonc"),
            status: "error",
            message: `unlink failed: ${(err as Error).message}`,
          });
        }
      }
    }
  }

  return results;
}

function main(): number {
  console.log(
    "[sync-dashboard-configs] Scanning workers/*/dashboard.jsonc ..."
  );
  let results: SyncResult[];
  try {
    results = sync();
  } catch (err) {
    console.error("[sync-dashboard-configs] FATAL:", (err as Error).message);
    return 2;
  }
  let errors = 0;
  let changed = 0;
  for (const r of results) {
    const tag = `[${r.status.toUpperCase()}]`;
    const msg = r.message ? ` — ${r.message}` : "";
    console.log(`  ${tag.padEnd(11)} ${r.worker}${msg}`);
    if (r.status === "error") errors++;
    if (r.status === "synced" || r.status === "removed") changed++;
  }
  console.log(
    `[sync-dashboard-configs] Done. ${results.length} entries, ${changed} changed, ${errors} errors.`
  );
  return errors > 0 ? 1 : 0;
}

if (import.meta.main) {
  process.exit(main());
}
