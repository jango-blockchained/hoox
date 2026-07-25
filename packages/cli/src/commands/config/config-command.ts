/**
 * `hoox config` command group — configuration and secrets management.
 *
 * Subcommands:
 *   show          Display current wrangler.jsonc config
 *   set <k> <v>   Update a config value in wrangler.jsonc
 *   secrets ...   Manage Cloudflare secrets (list, set, delete, sync)
 *   keys ...      Manage internal auth keys (generate, list)
 */
import { Command } from "commander";
import { modify, applyEdits, parse } from "jsonc-parser";
import type { FormattingOptions } from "jsonc-parser";

import {
  readConfigSync,
  writeConfigSync,
  resolveOperatorTransportProfile,
  type HooxConfigTransport,
} from "@jango-blockchained/hoox-shared";
import { ConfigService } from "../../services/config/index.js";
import { registerEnvCommand } from "./env-command.js";
import { registerKvCommand } from "./kv-command.js";
import { registerSecretsSubcommands } from "./secrets-subcommands.js";
import { registerKeysSubcommands } from "./keys-subcommands.js";
import { CLIError, ExitCode } from "../../utils/errors.js";
import { withErrorHandling } from "../../utils/error-handler.js";
import {
  formatSuccess,
  formatTable,
  formatKeyValue,
  formatJson,
  getFormatOptions,
} from "../../utils/formatters.js";
import { theme } from "../../utils/theme.js";

const TRANSPORT_VALUES = new Set<HooxConfigTransport>([
  "public",
  "access",
  "mtls",
  "tunnel",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FORMATTING_OPTIONS: FormattingOptions = {
  tabSize: 2,
  insertSpaces: true,
  eol: "\n",
};

/**
 * Convert a dot-separated user key path (e.g. "workers.d1-worker.vars.db")
 * into a jsonc-parser `JSONPath` array `["workers","d1-worker","vars","db"]`.
 */
function keyToPath(key: string): (string | number)[] {
  return key.split(".");
}

/**
 * Read the raw content of wrangler.jsonc.
 */
async function readConfigRaw(configPath?: string): Promise<string> {
  const path = configPath ?? "wrangler.jsonc";
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new CLIError(
      `Config file not found: ${path}`,
      ExitCode.INVALID_USAGE
    );
  }
  return await file.text();
}

/**
 * Write content back to wrangler.jsonc.
 */
async function writeConfigRaw(
  content: string,
  configPath?: string
): Promise<void> {
  const path = configPath ?? "wrangler.jsonc";
  await Bun.write(path, content);
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerConfigCommand(program: Command): void {
  const configCmd = program
    .command("config")
    .summary("Manage wrangler.jsonc configuration")
    .description(
      `Manage your Hoox configuration and secrets.

CONFIGURATION:
  The main configuration lives in wrangler.jsonc at the project root.
  Use 'config show' to view current settings and 'config set' to modify them.

SECRETS:
  Secrets are stored in Cloudflare and managed via 'config secrets'.
  Local development uses .dev.vars files in each worker directory.

KEYS:
  Generate and manage internal auth keys for inter-worker communication.
  Keys are stored in the .keys/ directory (add to .gitignore).

EXAMPLES:
  hoox config show                    Display current configuration
  hoox config set workers.agent-worker.enabled false
  hoox config secrets list            List secrets for a worker
  hoox config secrets set trade-worker BINANCE_KEY_BINDING
  hoox config keys generate           Generate new internal keys`
    );

  // ──────────────────────────────────────────────────────────────────────
  // show
  // ──────────────────────────────────────────────────────────────────────
  configCmd
    .command("show")
    .summary("Display current wrangler.jsonc configuration")
    .description(
      `Display the current wrangler.jsonc configuration in a formatted table.

Output includes:
  - Global settings (account_id, subdomain_prefix, etc.)
  - All workers with their enabled status, path, secrets count, and vars

OPTIONS:
  --json    Output raw JSON instead of formatted table

EXAMPLES:
  hoox config show
  hoox config show --json`
    )
    .action(
      withErrorHandling(
        async (_, cmd: Command) => {
          const opts = getFormatOptions(cmd);

          if (opts.json) {
            // Raw JSON output — just dump the file content parsed as JSON
            const raw = await readConfigRaw();
            const parsed = parse(raw);
            formatJson(parsed, opts);
            return;
          }

          const svc = new ConfigService();
          await svc.load();

          // Global section
          const global = svc.getGlobal();
          const globalPairs: Record<string, string> = {};
          for (const [k, v] of Object.entries(global)) {
            globalPairs[k] = v ?? "(not set)";
          }

          process.stdout.write(`${theme.heading("\nGlobal Configuration")}\n`);
          formatKeyValue(globalPairs, opts);

          // Workers table
          const workers = svc.listWorkers();
          if (workers.length > 0) {
            process.stdout.write(`\n${theme.heading("Workers")}\n`);
            const rows = workers.map((name) => {
              const w = svc.getWorker(name)!;
              return {
                Worker: name,
                Enabled: w.enabled ? `${theme.success("•")} yes` : "-",
                Path: w.path,
                Secrets: w.secrets?.length ? String(w.secrets.length) : "-",
                Vars:
                  w.vars && Object.keys(w.vars).length
                    ? String(Object.keys(w.vars).length)
                    : "-",
              };
            });
            formatTable(rows, opts);
          }
        },
        { service: "config" }
      )
    );

  // ──────────────────────────────────────────────────────────────────────
  // set <key> <value>
  // ──────────────────────────────────────────────────────────────────────
  configCmd
    .command("set <key> <value>")
    .summary("Update a config value in wrangler.jsonc")
    .description(
      `Update a configuration value in wrangler.jsonc.

ARGUMENTS:
  key     Dot-notation path to the config value (e.g., workers.agent-worker.enabled)
  value   New value (auto-detects type: boolean, number, or string)

PATH EXAMPLES:
  global.subdomain_prefix          → Set subdomain
  workers.trade-worker.enabled    → Enable/disable worker
  workers.agent-worker.vars.interval → Set worker variable

EXAMPLES:
  hoox config set global.subdomain_prefix myapp
  hoox config set workers.trade-worker.enabled false
  hoox config set workers.agent-worker.vars.interval 5`
    )
    .action(
      withErrorHandling(
        async (key: string, value: string, _, cmd: Command) => {
          const opts = getFormatOptions(cmd);

          const raw = await readConfigRaw();
          const jsonPath = keyToPath(key);

          // Attempt the edit — jsonc-parser throws on invalid paths
          let edits;
          try {
            edits = modify(raw, jsonPath, parseValue(value), {
              formattingOptions: FORMATTING_OPTIONS,
            });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new CLIError(
              `Invalid key path "${key}": ${msg}`,
              ExitCode.INVALID_USAGE
            );
          }

          const updated = applyEdits(raw, edits);
          await writeConfigRaw(updated);

          formatSuccess(
            `Updated "${key}" = "${value}" in wrangler.jsonc`,
            opts
          );
        },
        { service: "config" }
      )
    );

  // ──────────────────────────────────────────────────────────────────────
  // secrets subcommand group (shared with top-level `hoox secrets`)
  // ──────────────────────────────────────────────────────────────────────
  const secretsCmd = configCmd
    .command("secrets")
    .summary("Manage Cloudflare Worker secrets")
    .description(
      `Manage secrets for your Cloudflare Workers.

Secrets are defined in wrangler.jsonc under each worker's 'secrets' array.
They are stored securely in Cloudflare and uploaded via 'wrangler secret put'.

LOCAL DEVELOPMENT:
  For local development, create .dev.vars files in each worker directory.
  The 'config secrets sync' command can generate these from your config.

EXAMPLES:
  hoox config secrets list                    List all secrets
  hoox config secrets list trade-worker      List secrets for one worker
  hoox config secrets set trade-worker API_KEY  Set a secret value
  hoox config secrets delete trade-worker API_KEY  Delete a secret
  hoox config secrets sync                   Sync secrets to .dev.vars`
    );

  registerSecretsSubcommands(secretsCmd, "config");

  // ──────────────────────────────────────────────────────────────────────
  // env subcommand group
  // ──────────────────────────────────────────────────────────────────────
  registerEnvCommand(configCmd);

  // ──────────────────────────────────────────────────────────────────────
  // kv subcommand group
  // ──────────────────────────────────────────────────────────────────────
  registerKvCommand(configCmd);

  // ──────────────────────────────────────────────────────────────────────
  // transport — operator plane (HOOX_TRANSPORT / ~/.hoox/config.json)
  // ──────────────────────────────────────────────────────────────────────
  const transportCmd = configCmd
    .command("transport")
    .summary("Show or set operator transport (public|access|mtls|tunnel)")
    .description(
      `Operator transport for remote TUI/CLI management calls.

Values:
  public  — HTTPS + Bearer (default)
  access  — Cloudflare Access service-token headers (+ Bearer)
  mtls    — reserved (Enterprise client certs)
  tunnel  — reserved (private hostname; same headers as public)

Env HOOX_TRANSPORT overrides ~/.hoox/config.json when set.
Access credentials still come from CF_ACCESS_CLIENT_ID / SECRET.

EXAMPLES:
  hoox config transport
  hoox config transport set access
  hoox config transport set public`
    );

  transportCmd
    .command("show", { isDefault: true })
    .summary("Show resolved operator transport profile")
    .action(
      withErrorHandling(
        async (_, cmd: Command) => {
          const opts = getFormatOptions(cmd);
          const file = readConfigSync();
          const profile = resolveOperatorTransportProfile(process.env, {
            configTransport: file.transport,
            configApiUrl: file.apiUrl,
            configApiToken: file.apiToken,
          });
          const payload = {
            transport: profile.transport,
            apiBase: profile.apiBase,
            hasBearer: Boolean(profile.bearerToken),
            hasAccessServiceToken: Boolean(
              profile.accessClientId && profile.accessClientSecret
            ),
            configTransport: file.transport ?? null,
            envTransport: process.env.HOOX_TRANSPORT ?? null,
          };
          if (opts.json) {
            formatJson(payload, opts);
            return;
          }
          process.stdout.write(theme.heading("\nOperator transport\n\n"));
          formatKeyValue(
            {
              transport: payload.transport,
              apiBase: payload.apiBase,
              bearer: payload.hasBearer ? "set" : "unset",
              accessServiceToken: payload.hasAccessServiceToken
                ? "set"
                : "unset",
              "config.transport": String(
                payload.configTransport ?? "(default)"
              ),
              HOOX_TRANSPORT: String(payload.envTransport ?? "(unset)"),
            },
            opts
          );
          process.stdout.write("\n");
        },
        { service: "config" }
      )
    );

  transportCmd
    .command("set")
    .summary("Persist transport preference to ~/.hoox/config.json")
    .argument("<value>", "public | access | mtls | tunnel")
    .action(
      withErrorHandling(
        async (value: string, _, cmd: Command) => {
          const opts = getFormatOptions(cmd);
          const v = value.trim().toLowerCase() as HooxConfigTransport;
          if (!TRANSPORT_VALUES.has(v)) {
            throw new CLIError(
              `Invalid transport "${value}". Use: public | access | mtls | tunnel`,
              ExitCode.INVALID_USAGE
            );
          }
          const file = readConfigSync();
          file.transport = v;
          writeConfigSync(file);
          formatSuccess(
            `Saved transport=${v} to ~/.hoox/config.json (mode 600). Env HOOX_TRANSPORT still wins when set.`,
            opts
          );
        },
        { service: "config" }
      )
    );

  // ──────────────────────────────────────────────────────────────────────
  // keys subcommand group (shared with top-level `hoox keys`)
  // ──────────────────────────────────────────────────────────────────────
  const keysCmd = configCmd
    .command("keys")
    .summary("Manage internal auth keys")
    .description(
      `Generate and manage internal auth keys for inter-worker communication.

Keys are stored in the .keys/ directory as .env files (add .keys/ to .gitignore).
These keys are used for authentication between workers.

EXAMPLES:
  hoox config keys generate              Generate new keys
  hoox config keys list                  List existing keys`
    );

  registerKeysSubcommands(keysCmd, "config");
}

// ---------------------------------------------------------------------------
// Internal helpers (not exported)
// ---------------------------------------------------------------------------

/**
 * Parse a string value and attempt to coerce it to a proper type for JSON.
 * Numbers and booleans are detected; everything else stays as a string.
 */
function parseValue(raw: string): string | number | boolean {
  // Boolean
  if (raw === "true") return true;
  if (raw === "false") return false;

  // Integer / float
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return Number(raw);
  }

  // Keep as string
  return raw;
}
