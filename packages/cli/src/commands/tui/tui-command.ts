/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `hoox tui` command — launch the OpenTUI terminal operations center.
 *
 * Spawns the TUI as a child Bun process so it can take over the terminal
 * with alternate screen mode. When the TUI exits, control returns to the CLI.
 *
 * Entry resolution order:
 *   1. HOOX_TUI_ENTRY env (explicit file)
 *   2. Runtime monorepo (HOOX_REPO → cwd walk-up → ~/.hoox/repo)
 *   3. Paths relative to this CLI module (linked monorepo / workspace)
 *   4. Installed `@jango-blockchained/hoox-tui` package (node_modules)
 *   5. CWD-relative node_modules lookup
 */
import { Command } from "commander";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import {
  getHooxRepoPath,
  getTuiEntryCandidates,
  resolveHooxRuntimeRoot,
  readConfigSync,
} from "@jango-blockchained/hoox-shared";
import { theme } from "../../utils/theme.js";
import { CLIError, ExitCode } from "../../utils/errors.js";
import { withErrorHandling } from "../../utils/error-handler.js";
import { resolveGatewayUrl } from "../../services/perf/endpoint-resolver.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const TUI_PKG = "@jango-blockchained/hoox-tui";

/**
 * Collect candidate entry paths for the TUI main module.
 * Prefers source (dev) then dist (built / published package).
 */
function collectTuiCandidates(): string[] {
  const candidates: string[] = [];

  const explicit = process.env.HOOX_TUI_ENTRY?.trim();
  if (explicit) {
    candidates.push(resolve(explicit));
  }

  const runtime = resolveHooxRuntimeRoot();
  if (runtime.root) {
    candidates.push(...getTuiEntryCandidates(runtime.root));
  }

  // Always consider global repo even if markers failed (partial checkout)
  candidates.push(...getTuiEntryCandidates(getHooxRepoPath()));

  // Monorepo layouts relative to this CLI module
  candidates.push(
    resolve(__dirname, "../../../../tui/src/main.tsx"),
    resolve(__dirname, "../../../../tui/dist/main.js"),
    resolve(__dirname, "../../../tui/src/main.tsx"),
    resolve(__dirname, "../../../tui/dist/main.js"),
    resolve(process.cwd(), "packages/tui/src/main.tsx"),
    resolve(process.cwd(), "packages/tui/dist/main.js"),
    resolve(process.cwd(), "../tui/src/main.tsx"),
    resolve(process.cwd(), "../tui/dist/main.js")
  );

  // Resolve installed package from this module's resolution paths
  pushPackageEntries(candidates, require);

  // Also try from the user's cwd (local project node_modules)
  try {
    const cwdRequire = createRequire(join(process.cwd(), "package.json"));
    pushPackageEntries(candidates, cwdRequire);
  } catch {
    // no package.json in cwd — skip
  }

  // Global bun install location (bun add -g @jango-blockchained/hoox-tui)
  const bunGlobal = join(
    homedir(),
    ".bun",
    "install",
    "global",
    "node_modules",
    TUI_PKG
  );
  pushPackageRootEntries(candidates, bunGlobal);

  // npm/yarn global prefixes when present
  const npmGlobal = process.env.npm_config_prefix?.trim();
  if (npmGlobal) {
    pushPackageRootEntries(
      candidates,
      join(npmGlobal, "lib", "node_modules", TUI_PKG)
    );
  }

  // hoox-tui bin on PATH (follow symlink to package root)
  pushFromWhich(candidates, "hoox-tui");

  // Deduplicate while preserving order
  return [...new Set(candidates)];
}

function pushPackageRootEntries(candidates: string[], root: string): void {
  if (!root || !existsSync(root)) return;
  candidates.push(
    join(root, "dist", "main.js"),
    join(root, "src", "main.tsx"),
    join(root, "bin", "hoox-tui.js"),
    join(root, "src", "main.ts")
  );
}

function pushPackageEntries(candidates: string[], req: NodeRequire): void {
  try {
    const pkgJsonPath = req.resolve(`${TUI_PKG}/package.json`);
    pushPackageRootEntries(candidates, dirname(pkgJsonPath));
  } catch {
    // package not installed for this require context
  }
}

/** If `hoox-tui` is on PATH, add entries next to the resolved binary. */
function pushFromWhich(candidates: string[], binName: string): void {
  try {
    const which = Bun.which(binName);
    if (!which) return;
    let binPath = which;
    try {
      binPath = realpathSync(which);
    } catch {
      /* keep which path */
    }
    const binDir = dirname(binPath);
    // …/node_modules/@jango-blockchained/hoox-tui/bin/hoox-tui.js
    const pkgRoot = resolve(binDir, "..");
    pushPackageRootEntries(candidates, pkgRoot);
    // Also allow running the bin itself as the entry
    candidates.push(binPath);
  } catch {
    /* ignore */
  }
}

/** Resolve the TUI entry point or throw a helpful CLIError. */
export function resolveTUIEntry(): string {
  const candidates = collectTuiCandidates();
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }

  const runtime = resolveHooxRuntimeRoot();
  const globalRepo = getHooxRepoPath();

  throw new CLIError(
    [
      "Could not find the Hoox TUI entry point.",
      "",
      `  Runtime root: ${runtime.root ?? "(none)"} [${runtime.source}]`,
      `  Global repo:  ${globalRepo}`,
      "",
      "Fix options (pick one):",
      "",
      "  1) Lightweight — install the TUI package globally:",
      "       bun add -g @jango-blockchained/hoox-tui",
      "",
      "  2) Full runtime — clone monorepo into ~/.hoox/repo:",
      "       hoox doctor --fix-runtime",
      "",
      "  3) Dev — run inside a hoox checkout, or set:",
      "       export HOOX_REPO=/path/to/hoox",
      "       export HOOX_TUI_ENTRY=/path/to/packages/tui/src/main.tsx",
      "",
      "Then re-run: hx tui",
    ].join("\n"),
    ExitCode.ERROR
  );
}

export type TuiMode = "local" | "remote";

export interface TuiLaunchOptions {
  /** Explicit API base URL from `--api-url` (highest priority). */
  apiUrl?: string;
  /** Connect to the deployed gateway via `resolveGatewayUrl()`. */
  remote?: boolean;
  /**
   * Allow remote launch without Bearer / Access credentials.
   * Escape hatch for local debugging only — not recommended.
   */
  allowInsecure?: boolean;
  /** Explicit Bearer from `--token`. */
  token?: string;
}

export interface TuiLaunchConfig {
  apiBase: string;
  tuiMode: TuiMode;
  /** Which resolution branch produced this config (for dev logging). */
  source: "api-url" | "remote-gateway" | "local-default";
}

export interface TuiAuthStatus {
  hasToken: boolean;
  /** How the token was supplied (never includes the secret). */
  source: "flag" | "env" | "none";
}

/**
 * Resolve bearer token for the TUI child process.
 * Priority: explicit `--token` → `HOOX_API_TOKEN` env.
 * Never returns the raw token for display — use `hasToken` / `source` only.
 */
export function resolveTuiAuthStatus(options: {
  token?: string;
  envToken?: string | undefined;
}): TuiAuthStatus {
  const fromFlag = options.token?.trim();
  if (fromFlag) return { hasToken: true, source: "flag" };
  const fromEnv =
    options.envToken?.trim() ?? process.env.HOOX_API_TOKEN?.trim();
  if (fromEnv) return { hasToken: true, source: "env" };
  return { hasToken: false, source: "none" };
}

/** Banner line for auth (never includes the secret). */
export function formatTuiAuthBanner(
  status: TuiAuthStatus,
  mode: TuiMode
): string {
  if (status.hasToken) {
    const via = status.source === "flag" ? "--token" : "HOOX_API_TOKEN";
    return `set (Bearer via ${via})`;
  }
  if (mode === "remote") {
    return "missing — remote may reject requests (set HOOX_API_TOKEN or --token)";
  }
  return "not set (optional for local wrangler dev)";
}

/** Effective token string to forward to the child (empty if none). */
export function resolveTuiAuthToken(options: {
  token?: string;
  envToken?: string | undefined;
}): string {
  const fromFlag = options.token?.trim();
  if (fromFlag) return fromFlag;
  return options.envToken?.trim() ?? process.env.HOOX_API_TOKEN?.trim() ?? "";
}

/**
 * Whether Cloudflare Access service-token env vars are present.
 * Used as an alternative to Bearer for remote operator auth (Phase 0/1).
 */
export function hasAccessServiceToken(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const id = env.CF_ACCESS_CLIENT_ID?.trim();
  const secret = env.CF_ACCESS_CLIENT_SECRET?.trim();
  return Boolean(id && secret);
}

export type RemoteAuthGateResult =
  | { ok: true; method: "bearer" | "access" | "allow-insecure" }
  | { ok: false; reason: string };

/**
 * Fail-closed gate for remote TUI launches.
 *
 * Remote mode requires at least one of:
 *   - Bearer (`--token` / `HOOX_API_TOKEN`)
 *   - Access service token env (`CF_ACCESS_CLIENT_ID` + `CF_ACCESS_CLIENT_SECRET`)
 *   - explicit `--allow-insecure` (escape hatch)
 */
export function assertRemoteAuthReady(options: {
  tuiMode: TuiMode;
  hasToken: boolean;
  allowInsecure?: boolean;
  hasAccess?: boolean;
}): RemoteAuthGateResult {
  if (options.tuiMode !== "remote") {
    return { ok: true, method: "bearer" };
  }
  if (options.hasToken) return { ok: true, method: "bearer" };
  if (options.hasAccess) return { ok: true, method: "access" };
  if (options.allowInsecure) return { ok: true, method: "allow-insecure" };
  return {
    ok: false,
    reason: [
      "Remote TUI requires operator credentials (fail-closed).",
      "",
      "Provide one of:",
      "  • HOOX_API_TOKEN / --token <value>   (Bearer for management API)",
      "  • CF_ACCESS_CLIENT_ID + CF_ACCESS_CLIENT_SECRET  (Access service token)",
      "",
      "Escape hatch (not recommended):",
      "  • --allow-insecure   launch without credentials (gateway may return 401)",
      "",
      "Note: Bearer alone is not enough until the management API enforces",
      "requireAuth on the server. Prefer a management hostname behind",
      "Cloudflare Access; mTLS client certs are an Enterprise follow-up.",
    ].join("\n"),
  };
}

/**
 * Resolve API base URL + LOCAL/REMOTE mode for `hoox tui`.
 *
 * Priority:
 *   1. `--api-url` → remote mode, use URL as-is (trailing slashes stripped)
 *   2. `--remote`  → remote mode, `resolveGatewayUrl()` (HOOX_GATEWAY_URL / CF account)
 *   3. neither     → local mode, `HOOX_API_URL` or `http://localhost:8787`
 *
 * @param options Commander option bag (or partial for tests)
 * @param resolveRemote Injected gateway resolver (default: production `resolveGatewayUrl`)
 */
export function resolveTuiLaunchConfig(
  options: TuiLaunchOptions,
  resolveRemote: () => string = resolveGatewayUrl
): TuiLaunchConfig {
  if (options.apiUrl) {
    return {
      apiBase: options.apiUrl.replace(/\/+$/, ""),
      tuiMode: "remote",
      source: "api-url",
    };
  }

  if (options.remote) {
    try {
      return {
        apiBase: resolveRemote().replace(/\/+$/, ""),
        tuiMode: "remote",
        source: "remote-gateway",
      };
    } catch {
      throw new CLIError(
        [
          "Cannot resolve hoox gateway URL.",
          "",
          "Set one of:",
          "  • HOOX_GATEWAY_URL=https://your-gateway.workers.dev",
          "  • CLOUDFLARE_ACCOUNT_ID=<your-account-id>",
          "",
          "Or pass an explicit URL: hoox tui --api-url https://...",
        ].join("\n"),
        ExitCode.ERROR
      );
    }
  }

  return {
    apiBase: process.env.HOOX_API_URL || "http://localhost:8787",
    tuiMode: "local",
    source: "local-default",
  };
}

/** True when HOOX_DEBUG / TUI_DEBUG request verbose launch diagnostics. */
function isDevLogEnabled(): boolean {
  const v = process.env.HOOX_DEBUG ?? process.env.TUI_DEBUG ?? "";
  return v === "1" || v === "true" || v === "yes";
}

export function registerTUICommand(program: Command): void {
  program
    .command("tui")
    .description("Launch the OpenTUI terminal operations center")
    .option("--fps <number>", "Target frames per second", "30")
    .option("--no-mouse", "Disable mouse support")
    .option("--remote", "Connect to the deployed Cloudflare gateway")
    .option("--api-url <url>", "Explicit API base URL (overrides --remote)")
    .option(
      "--token <token>",
      "Bearer token for API auth (sets HOOX_API_TOKEN for this session)"
    )
    .option("--debug", "Enable TUI dev logging (HOOX_DEBUG=1 → debug.log)")
    .option(
      "--allow-insecure",
      "Allow remote launch without Bearer/Access credentials (not recommended)"
    )
    .action(
      withErrorHandling(
        async (options) => {
          const tuiEntry = resolveTUIEntry();
          const { apiBase, tuiMode, source } = resolveTuiLaunchConfig(options);
          const authStatus = resolveTuiAuthStatus({ token: options.token });
          const authToken = resolveTuiAuthToken({ token: options.token });
          const accessReady = hasAccessServiceToken();

          const authGate = assertRemoteAuthReady({
            tuiMode,
            hasToken: authStatus.hasToken,
            allowInsecure: Boolean(options.allowInsecure),
            hasAccess: accessReady,
          });
          if (!authGate.ok) {
            throw new CLIError(authGate.reason, ExitCode.ERROR);
          }

          const modeLabel = tuiMode === "remote" ? "REMOTE" : "LOCAL";
          console.log(
            theme.heading("\nLaunching HOOX Terminal Operations Center...\n")
          );
          console.log(theme.dim(`  Entry: ${tuiEntry}`));
          console.log(theme.dim(`  Mode:  ${modeLabel}`));
          console.log(theme.dim(`  API:   ${apiBase}`));
          console.log(
            theme.dim(`  Auth:  ${formatTuiAuthBanner(authStatus, tuiMode)}`)
          );
          if (tuiMode === "remote" && accessReady && !authStatus.hasToken) {
            console.log(
              theme.dim(
                `  Access: CF_ACCESS_CLIENT_ID/SECRET present (service token)`
              )
            );
          }
          console.log(theme.dim(`  FPS:   ${options.fps}`));
          console.log(
            theme.dim(`  Mouse: ${options.mouse ? "enabled" : "disabled"}`)
          );

          if (authGate.method === "allow-insecure") {
            console.log(
              theme.warning(
                "\n  ⚠  --allow-insecure: remote launch without credentials."
              )
            );
            console.log(
              theme.dim(
                "     Management API (when enabled) will reject unauthenticated requests.\n"
              )
            );
          } else if (
            tuiMode === "remote" &&
            !authStatus.hasToken &&
            accessReady
          ) {
            console.log(
              theme.dim(
                "\n  Using Access service token env; Bearer optional as second factor.\n"
              )
            );
          } else {
            console.log("");
          }

          const debugEnabled = Boolean(options.debug) || isDevLogEnabled();
          if (debugEnabled) {
            console.log(theme.dim(`  Debug: enabled (source=${source})`));
            console.log(
              theme.dim(`         log → $HOME/.hoox/.tui-state/debug.log\n`)
            );
          }

          // Prefer file-backed transport when env is unset (config transport set)
          let configTransport: string | undefined;
          try {
            const fileCfg = readConfigSync();
            configTransport = fileCfg.transport;
          } catch {
            // ignore — config optional
          }

          // Spawn the TUI as a child process — it takes over the terminal
          const child = spawn("bun", ["run", tuiEntry], {
            stdio: "inherit", // TUI gets full terminal control
            env: {
              ...process.env,
              TUI_FPS: options.fps,
              TUI_MOUSE: options.mouse ? "1" : "0",
              HOOX_API_URL: apiBase,
              HOOX_TUI_MODE: tuiMode,
              ...(authToken ? { HOOX_API_TOKEN: authToken } : {}),
              ...(debugEnabled ? { HOOX_DEBUG: "1", TUI_DEBUG: "1" } : {}),
              ...(configTransport && !process.env.HOOX_TRANSPORT
                ? { HOOX_TRANSPORT: configTransport }
                : {}),
            },
          });

          // Wait for TUI to exit
          await new Promise<void>((resolveChild, reject) => {
            child.on("close", (code) => {
              if (code === 0) {
                console.log(theme.dim("\nTUI session ended.\n"));
                resolveChild();
              } else if (code !== null) {
                console.log(theme.dim(`\nTUI exited with code ${code}\n`));
                resolveChild();
              } else {
                reject(
                  new CLIError(
                    "TUI process terminated abnormally",
                    ExitCode.ERROR
                  )
                );
              }
            });

            child.on("error", (err) => {
              reject(
                new CLIError(
                  `Failed to launch TUI: ${err.message}`,
                  ExitCode.ERROR
                )
              );
            });
          });
        },
        { service: "tui" }
      )
    );
}
