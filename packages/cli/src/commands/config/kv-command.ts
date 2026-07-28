/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `hoox config kv` subcommand group — KV namespace key management.
 *
 * Subcommands:
 *   list                           — List all keys
 *   get <key>                      — Get a key's value
 *   set <key> <value>              — Set a key's value
 *   delete <key>                   — Delete a key
 *   apply-manifest                 — Apply manifest defaults
 *   manifest                       — Show expected manifest keys
 */

import { Command } from "commander";
import { KvSyncService } from "../../services/kv/index.js";
import {
  formatSuccess,
  formatTable,
  formatJson,
  getFormatOptions,
} from "../../utils/formatters.js";
import { CLIError, ExitCode } from "../../utils/errors.js";
import { withErrorHandling } from "../../utils/error-handler.js";
import { theme } from "../../utils/theme.js";
import type { FormatOptions } from "../../utils/formatters.js";

async function resolveNs(cmd: Command): Promise<string> {
  const svc = new KvSyncService();
  const opts = cmd.optsWithGlobals<{ namespaceId?: string }>();
  return await svc.resolveNamespaceId(opts.namespaceId);
}

// ---------------------------------------------------------------------------
// kv list
// ---------------------------------------------------------------------------

async function handleList(opts: FormatOptions, nsId: string): Promise<void> {
  const svc = new KvSyncService();
  const keys = await svc.list(nsId);

  if (opts.json) {
    formatJson(keys, opts);
  } else if (!opts.quiet) {
    if (keys.length === 0) {
      process.stdout.write("No keys found in KV namespace.\n");
      return;
    }
    const rows = keys.map((k) => ({ Key: k.name }));
    formatTable(rows, opts);
  }
}

// ---------------------------------------------------------------------------
// kv get
// ---------------------------------------------------------------------------

async function handleGet(
  opts: FormatOptions,
  nsId: string,
  key: string
): Promise<void> {
  const svc = new KvSyncService();
  const value = await svc.get(nsId, key);

  if (value === null) {
    throw new CLIError(
      `Key "${key}" not found in KV namespace`,
      ExitCode.ERROR
    );
  }

  if (opts.json) {
    formatJson({ key, value }, opts);
  } else {
    process.stdout.write(`${value}\n`);
  }
}

// ---------------------------------------------------------------------------
// kv set
// ---------------------------------------------------------------------------

async function handleSet(
  opts: FormatOptions,
  nsId: string,
  key: string,
  value: string
): Promise<void> {
  const svc = new KvSyncService();
  await svc.set(nsId, key, value);
  formatSuccess(`Set "${key}" in KV namespace`, opts);
}

// ---------------------------------------------------------------------------
// kv delete
// ---------------------------------------------------------------------------

async function handleDelete(
  opts: FormatOptions,
  nsId: string,
  key: string
): Promise<void> {
  const svc = new KvSyncService();
  await svc.delete(nsId, key);
  formatSuccess(`Deleted "${key}" from KV namespace`, opts);
}

// ---------------------------------------------------------------------------
// kv apply-manifest
// ---------------------------------------------------------------------------

async function handleApplyManifest(
  opts: FormatOptions,
  nsId: string
): Promise<void> {
  const svc = new KvSyncService();
  let manifest;
  try {
    manifest = KvSyncService.getManifest();
  } catch (err) {
    throw new CLIError(
      err instanceof Error ? err.message : String(err),
      ExitCode.ERROR
    );
  }
  if (manifest.keys.length === 0) {
    throw new CLIError(
      "No dashboard.jsonc keys found under workers/*/dashboard.jsonc. " +
        "Set HOOX_REPO or run from the monorepo root.",
      ExitCode.ERROR
    );
  }
  let setCount = 0;
  const errors: string[] = [];

  const applyable = manifest.keys.filter(
    (k) => !k.secret && k.default !== undefined && k.default !== ""
  );

  for (const keyDef of applyable) {
    try {
      await svc.set(nsId, keyDef.key, keyDef.default);
      setCount++;
    } catch (err) {
      errors.push(
        `${keyDef.key}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  formatSuccess(
    `Applied ${setCount}/${applyable.length} dashboard.jsonc keys` +
      ` (${manifest.keys.length - applyable.length} secrets/empty skipped,` +
      ` ${errors.length} errors)`,
    opts
  );
}

// ---------------------------------------------------------------------------
// kv manifest
// ---------------------------------------------------------------------------

async function handleManifest(opts: FormatOptions): Promise<void> {
  let manifest;
  try {
    manifest = KvSyncService.getManifest();
  } catch (err) {
    throw new CLIError(
      err instanceof Error ? err.message : String(err),
      ExitCode.ERROR
    );
  }
  if (manifest.keys.length === 0) {
    throw new CLIError(
      "No dashboard.jsonc keys found under workers/*/dashboard.jsonc. " +
        "Set HOOX_REPO or run from the monorepo root.",
      ExitCode.ERROR
    );
  }

  if (opts.json) {
    formatJson(manifest, opts);
  } else if (!opts.quiet) {
    const root = KvSyncService.resolveRoot();
    process.stdout.write(
      `${theme.heading(`KV Manifest: ${manifest.namespace}`)}` +
        (root ? ` ${theme.muted(`(${root})`)}` : "") +
        `\n\n`
    );
    const rows = manifest.keys.map((k) => ({
      Key: k.key,
      Type: k.type,
      Default: k.default || "-",
      Secret: k.secret ? "yes" : "no",
      Description: k.description,
    }));
    formatTable(rows, opts);
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerKvCommand(parentCmd: Command): void {
  const kvCmd = parentCmd
    .command("kv")
    .summary("Manage KV namespace keys")
    .description(
      `Manage Cloudflare KV namespace keys and apply the key manifest.

SUBCOMMANDS:
  list              List all keys in the KV namespace
  get <key>         Get a key's value
  set <key> <value> Set a key's value
  delete <key>      Delete a key
  apply-manifest    Apply defaults from workers/NAME/dashboard.jsonc
  manifest          Show keys from workers/NAME/dashboard.jsonc

OPTIONS:
  --namespace-id <id>  KV namespace ID (auto-detected from wrangler if omitted)

EXAMPLES:
  hoox config kv list
  hoox config kv set trade:kill_switch true
  hoox config kv get trade:kill_switch
  hoox config kv delete trade:kill_switch
  hoox config kv apply-manifest
  hoox config kv manifest`
    )
    .option(
      "--namespace-id <id>",
      "KV namespace ID (auto-detected if omitted)"
    );

  // -- list
  kvCmd
    .command("list")
    .description("List all keys in the KV namespace")
    .action(
      withErrorHandling(
        async (_, cmd: Command) => {
          const opts = getFormatOptions(cmd);
          const nsId = await resolveNs(cmd);
          await handleList(opts, nsId);
        },
        { service: "kv" }
      )
    );

  // -- get
  kvCmd
    .command("get <key>")
    .description("Get a key's value from the KV namespace")
    .action(
      withErrorHandling(
        async (key: string, _, cmd: Command) => {
          const opts = getFormatOptions(cmd);
          const nsId = await resolveNs(cmd);
          await handleGet(opts, nsId, key);
        },
        { service: "kv" }
      )
    );

  // -- set
  kvCmd
    .command("set <key> <value>")
    .description("Set a key's value in the KV namespace")
    .action(
      withErrorHandling(
        async (key: string, value: string, _, cmd: Command) => {
          const opts = getFormatOptions(cmd);
          const nsId = await resolveNs(cmd);
          await handleSet(opts, nsId, key, value);
        },
        { service: "kv" }
      )
    );

  // -- delete
  kvCmd
    .command("delete <key>")
    .description("Delete a key from the KV namespace")
    .action(
      withErrorHandling(
        async (key: string, _, cmd: Command) => {
          const opts = getFormatOptions(cmd);
          const nsId = await resolveNs(cmd);
          await handleDelete(opts, nsId, key);
        },
        { service: "kv" }
      )
    );

  // -- apply-manifest
  kvCmd
    .command("apply-manifest")
    .description(
      "Apply key defaults from workers/NAME/dashboard.jsonc into the KV namespace"
    )
    .action(
      withErrorHandling(
        async (_, cmd: Command) => {
          const opts = getFormatOptions(cmd);
          const nsId = await resolveNs(cmd);
          await handleApplyManifest(opts, nsId);
        },
        { service: "kv" }
      )
    );

  // -- manifest
  kvCmd
    .command("manifest")
    .description(
      "Show expected KV keys derived from workers/NAME/dashboard.jsonc"
    )
    .action(
      withErrorHandling(
        async (_, cmd: Command) => {
          const opts = getFormatOptions(cmd);
          await handleManifest(opts);
        },
        { service: "kv" }
      )
    );
}
