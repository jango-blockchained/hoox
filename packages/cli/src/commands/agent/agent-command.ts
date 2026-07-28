/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from "commander";
import { readFileSync } from "node:fs";
import {
  getFormatOptions,
  formatJson,
  formatTable,
  formatSuccess,
} from "../../utils/formatters.js";
import { withErrorHandling } from "../../utils/error-handler.js";
import { ExitCode } from "../../utils/errors.js";
import type { FormatOptions } from "../../utils/formatters.js";

export type ProviderStatus = "online" | "degraded" | "offline";

export interface ProviderHealth {
  name: string;
  model: string;
  status: ProviderStatus;
  latencyMs: number | null;
  dailyRequests: number | null;
  error?: string;
}

interface AgentHealthResult {
  providers: ProviderHealth[];
  timestamp: string;
}

export interface HealthOptions extends FormatOptions {
  probe?: boolean;
  timeout?: number;
}

interface ProviderDef {
  name: string;
  model: string;
  envVar: string;
}

const PROVIDERS: ProviderDef[] = [
  {
    name: "Workers AI",
    model: "@cf/meta/llama-3.1-8b-instruct",
    envVar: "CLOUDFLARE_API_TOKEN",
  },
  { name: "OpenAI", model: "gpt-4o", envVar: "OPENAI_API_KEY" },
  {
    name: "Anthropic",
    model: "claude-sonnet-4-20250514",
    envVar: "ANTHROPIC_API_KEY",
  },
  { name: "Google", model: "gemini-2.0-flash", envVar: "GOOGLE_API_KEY" },
  { name: "Azure", model: "gpt-4o", envVar: "AZURE_API_KEY" },
];

const DEFAULT_PROBE_TIMEOUT_MS = 8000;

function checkEnvVar(name: string): string | null {
  try {
    const val = process.env[name];
    if (val && val.length > 0) return val;
  } catch {
    // intentionally ignored — env var access should not throw, but be defensive
  }
  return null;
}

/**
 * Test-only hook: replace .dev.vars / env-file secret loading.
 * Pass `() => ({})` to ignore on-disk .dev.vars. Pass `null` to restore.
 */
let secretSourceOverride: (() => Record<string, string>) | null = null;

export function __setSecretSourceForTests(
  fn: (() => Record<string, string>) | null
): void {
  secretSourceOverride = fn;
}

function checkDevVars(): Record<string, string> {
  if (secretSourceOverride) return { ...secretSourceOverride() };

  const found: Record<string, string> = {};
  const candidates = ["workers/agent-worker/.dev.vars", ".dev.vars"];

  for (const filePath of candidates) {
    try {
      const content = readFileSync(filePath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        if (key && value) found[key] = value;
      }
    } catch {
      // intentionally ignored — .dev.vars file may not exist yet
    }
  }

  return found;
}

function getConfiguredKeys(): Set<string> {
  const keys = new Set<string>();

  const envKey = checkEnvVar("AGENT_INTERNAL_KEY");
  if (envKey) keys.add("AGENT_INTERNAL_KEY");

  const devVars = checkDevVars();
  if (devVars.AGENT_INTERNAL_KEY) keys.add("AGENT_INTERNAL_KEY");

  for (const p of PROVIDERS) {
    const val = checkEnvVar(p.envVar);
    if (val) keys.add(p.envVar);
    if (devVars[p.envVar]) keys.add(p.envVar);
  }

  return keys;
}

/** Resolve a secret from env or .dev.vars without logging it. */
export function resolveSecret(name: string): string | null {
  const fromEnv = checkEnvVar(name);
  if (fromEnv) return fromEnv;
  const devVars = checkDevVars();
  return devVars[name] ?? null;
}

/** Strip any accidental secret-looking substrings from error notes. */
function sanitizeErrorMessage(message: string, secrets: string[]): string {
  let out = message;
  for (const secret of secrets) {
    if (secret && secret.length >= 8 && out.includes(secret)) {
      out = out.split(secret).join("[redacted]");
    }
  }
  // Avoid dumping full query strings that may contain API keys
  out = out.replace(/([?&]key=)[^&\s]+/gi, "$1[redacted]");
  return out;
}

export interface ProbeResult {
  status: ProviderStatus;
  latencyMs: number | null;
  error?: string;
}

async function timedFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<{ response: Response; latencyMs: number }> {
  const start = performance.now();
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const latencyMs = Math.round(performance.now() - start);
  return { response, latencyMs };
}

function classifyHttpStatus(status: number): ProviderStatus {
  if (status >= 200 && status < 300) return "online";
  if (status === 401 || status === 403) return "offline";
  if (status === 429 || status >= 500) return "degraded";
  // 4xx other than auth — reachable but request rejected
  if (status >= 400 && status < 500) return "degraded";
  return "offline";
}

async function probeWorkersAi(
  token: string,
  timeoutMs: number
): Promise<ProbeResult> {
  const accountId = resolveSecret("CLOUDFLARE_ACCOUNT_ID");
  const secrets = [token, accountId].filter((s): s is string => Boolean(s));

  try {
    if (accountId) {
      const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search`;
      const { response, latencyMs } = await timedFetch(
        url,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
        timeoutMs
      );
      // models/search may 405/404 on some accounts — fall through to token verify
      if (response.ok || response.status === 401 || response.status === 403) {
        const status = classifyHttpStatus(response.status);
        return {
          status,
          latencyMs,
          error:
            status === "online"
              ? undefined
              : sanitizeErrorMessage(
                  `HTTP ${response.status} ${response.statusText}`,
                  secrets
                ),
        };
      }
    }

    const { response, latencyMs } = await timedFetch(
      "https://api.cloudflare.com/client/v4/user/tokens/verify",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
      timeoutMs
    );
    const status = classifyHttpStatus(response.status);
    // Token verify proves credential validity; without account_id mark degraded
    // only if models path was skipped and we only have token verify success.
    if (status === "online" && !accountId) {
      return {
        status: "degraded",
        latencyMs,
        error: "token ok (CLOUDFLARE_ACCOUNT_ID missing for Workers AI models)",
      };
    }
    return {
      status,
      latencyMs,
      error:
        status === "online"
          ? undefined
          : sanitizeErrorMessage(
              `HTTP ${response.status} ${response.statusText}`,
              secrets
            ),
    };
  } catch (err) {
    return {
      status: "offline",
      latencyMs: null,
      error: sanitizeErrorMessage(formatFetchError(err), secrets),
    };
  }
}

async function probeOpenAi(
  apiKey: string,
  timeoutMs: number
): Promise<ProbeResult> {
  const secrets = [apiKey];
  try {
    const { response, latencyMs } = await timedFetch(
      "https://api.openai.com/v1/models",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      },
      timeoutMs
    );
    const status = classifyHttpStatus(response.status);
    return {
      status,
      latencyMs,
      error:
        status === "online"
          ? undefined
          : sanitizeErrorMessage(
              `HTTP ${response.status} ${response.statusText}`,
              secrets
            ),
    };
  } catch (err) {
    return {
      status: "offline",
      latencyMs: null,
      error: sanitizeErrorMessage(formatFetchError(err), secrets),
    };
  }
}

async function probeAnthropic(
  apiKey: string,
  timeoutMs: number
): Promise<ProbeResult> {
  const secrets = [apiKey];
  try {
    const { response, latencyMs } = await timedFetch(
      "https://api.anthropic.com/v1/models",
      {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          Accept: "application/json",
        },
      },
      timeoutMs
    );

    if (response.ok) {
      return { status: "online", latencyMs };
    }

    // Prefer models endpoint; on 404 try a minimal messages count-style request
    if (response.status === 404) {
      const start = performance.now();
      try {
        const msgRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1,
            messages: [{ role: "user", content: "ping" }],
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const lat = Math.round(performance.now() - start);
        // 200 = online; 400 (bad request but auth ok) / 429 = reachable
        if (msgRes.ok) return { status: "online", latencyMs: lat };
        if (msgRes.status === 401 || msgRes.status === 403) {
          return {
            status: "offline",
            latencyMs: lat,
            error: sanitizeErrorMessage(
              `HTTP ${msgRes.status} ${msgRes.statusText}`,
              secrets
            ),
          };
        }
        // Auth accepted enough to get a validation/rate response
        if (msgRes.status === 400 || msgRes.status === 429) {
          return {
            status: "online",
            latencyMs: lat,
            error: undefined,
          };
        }
        return {
          status: classifyHttpStatus(msgRes.status),
          latencyMs: lat,
          error: sanitizeErrorMessage(
            `HTTP ${msgRes.status} ${msgRes.statusText}`,
            secrets
          ),
        };
      } catch (err) {
        return {
          status: "offline",
          latencyMs: null,
          error: sanitizeErrorMessage(formatFetchError(err), secrets),
        };
      }
    }

    const status = classifyHttpStatus(response.status);
    return {
      status,
      latencyMs,
      error: sanitizeErrorMessage(
        `HTTP ${response.status} ${response.statusText}`,
        secrets
      ),
    };
  } catch (err) {
    return {
      status: "offline",
      latencyMs: null,
      error: sanitizeErrorMessage(formatFetchError(err), secrets),
    };
  }
}

async function probeGoogle(
  apiKey: string,
  timeoutMs: number
): Promise<ProbeResult> {
  const secrets = [apiKey];
  // Key is in the query string — never surface the full URL in errors
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  try {
    const { response, latencyMs } = await timedFetch(
      url,
      {
        method: "GET",
        headers: { Accept: "application/json" },
      },
      timeoutMs
    );
    const status = classifyHttpStatus(response.status);
    return {
      status,
      latencyMs,
      error:
        status === "online"
          ? undefined
          : sanitizeErrorMessage(
              `HTTP ${response.status} ${response.statusText}`,
              secrets
            ),
    };
  } catch (err) {
    return {
      status: "offline",
      latencyMs: null,
      error: sanitizeErrorMessage(formatFetchError(err), secrets),
    };
  }
}

async function probeAzure(
  apiKey: string,
  timeoutMs: number
): Promise<ProbeResult> {
  const secrets = [apiKey];
  const endpoint =
    resolveSecret("AZURE_ENDPOINT") ?? resolveSecret("OPENAI_API_BASE");

  if (!endpoint) {
    return {
      status: "degraded",
      latencyMs: null,
      error: "AZURE_ENDPOINT missing",
    };
  }

  const base = endpoint.replace(/\/+$/, "");
  const url = `${base}/openai/models?api-version=2024-02-01`;

  try {
    const { response, latencyMs } = await timedFetch(
      url,
      {
        method: "GET",
        headers: {
          "api-key": apiKey,
          Accept: "application/json",
        },
      },
      timeoutMs
    );
    const status = classifyHttpStatus(response.status);
    return {
      status,
      latencyMs,
      error:
        status === "online"
          ? undefined
          : sanitizeErrorMessage(
              `HTTP ${response.status} ${response.statusText}`,
              secrets
            ),
    };
  } catch (err) {
    return {
      status: "offline",
      latencyMs: null,
      error: sanitizeErrorMessage(formatFetchError(err), secrets),
    };
  }
}

function formatFetchError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return "probe timed out";
    }
    return err.message || "network error";
  }
  return "network error";
}

/** Run a cheap live probe for a single named provider. Exported for tests. */
export async function probeProvider(
  name: string,
  apiKey: string,
  timeoutMs: number
): Promise<ProbeResult> {
  switch (name) {
    case "Workers AI":
      return probeWorkersAi(apiKey, timeoutMs);
    case "OpenAI":
      return probeOpenAi(apiKey, timeoutMs);
    case "Anthropic":
      return probeAnthropic(apiKey, timeoutMs);
    case "Google":
      return probeGoogle(apiKey, timeoutMs);
    case "Azure":
      return probeAzure(apiKey, timeoutMs);
    default:
      return {
        status: "offline",
        latencyMs: null,
        error: `unknown provider: ${name}`,
      };
  }
}

function providerHasConfig(p: ProviderDef, configured: Set<string>): boolean {
  if (configured.has(p.envVar) || configured.has("AGENT_INTERNAL_KEY")) {
    return true;
  }
  // Workers AI: CLOUDFLARE_API_TOKEN is the envVar already
  if (p.name === "Workers AI" && checkEnvVar("CLOUDFLARE_API_TOKEN")) {
    return true;
  }
  return false;
}

export async function handleHealth(opts: HealthOptions): Promise<void> {
  const configured = getConfiguredKeys();
  const timestamp = new Date().toISOString();
  const doProbe = Boolean(opts.probe);
  const timeoutMs =
    typeof opts.timeout === "number" && Number.isFinite(opts.timeout)
      ? Math.max(1, Math.floor(opts.timeout))
      : DEFAULT_PROBE_TIMEOUT_MS;

  // Config-only path (default): fast, no network
  if (!doProbe) {
    const providers: ProviderHealth[] = [];

    for (const p of PROVIDERS) {
      const hasKey = providerHasConfig(p, configured);

      if (!hasKey) {
        providers.push({
          name: p.name,
          model: p.model,
          status: "offline",
          latencyMs: null,
          dailyRequests: null,
          error: "No API key configured",
        });
        continue;
      }

      // Key present only — no live probe yet (avoids burning provider quota).
      providers.push({
        name: p.name,
        model: p.model,
        status: "online",
        latencyMs: null,
        dailyRequests: null,
        error: undefined,
      });
    }

    const display = providers.map((p) => ({
      ...p,
      status:
        p.status === "online" ? ("online" as const) : ("offline" as const),
      note:
        p.status === "online"
          ? "key configured (not probed)"
          : (p.error ?? "missing key"),
    }));

    const result: AgentHealthResult = {
      providers: display.map(({ note: _n, ...rest }) => rest),
      timestamp,
    };

    const anyOffline = display.some((p) => p.status === "offline");

    if (opts.json) {
      formatJson(
        {
          ...result,
          providers: display.map((p) => ({
            name: p.name,
            model: p.model,
            status: p.status,
            configured: p.status === "online",
            note: p.note,
            latencyMs: p.latencyMs,
            dailyRequests: p.dailyRequests,
          })),
        },
        opts
      );
    } else {
      formatTable(
        display.map((p) => ({
          Provider: p.name,
          Model: p.model,
          Status: p.status === "online" ? "configured" : "missing",
          Note: p.note,
        })),
        opts
      );
      formatSuccess(
        anyOffline
          ? "Some providers lack API keys — set env vars or workers/agent-worker/.dev.vars"
          : "All listed providers have credentials configured (no live probe)",
        opts
      );
    }

    if (anyOffline) {
      process.exitCode = ExitCode.ERROR;
    }
    return;
  }

  // Live probe path
  type DisplayRow = ProviderHealth & { note: string; configured: boolean };

  const probeJobs = PROVIDERS.map(async (p): Promise<DisplayRow> => {
    const apiKey = resolveSecret(p.envVar);
    const hasConfig = providerHasConfig(p, configured);

    if (!apiKey) {
      // Configured via AGENT_INTERNAL_KEY only — cannot live-probe provider APIs
      if (configured.has("AGENT_INTERNAL_KEY")) {
        return {
          name: p.name,
          model: p.model,
          status: "degraded",
          latencyMs: null,
          dailyRequests: null,
          error: `${p.envVar} missing (AGENT_INTERNAL_KEY only)`,
          note: `${p.envVar} missing (AGENT_INTERNAL_KEY only)`,
          configured: true,
        };
      }
      return {
        name: p.name,
        model: p.model,
        status: "offline",
        latencyMs: null,
        dailyRequests: null,
        error: "No API key configured",
        note: "missing key",
        configured: false,
      };
    }

    const result = await probeProvider(p.name, apiKey, timeoutMs);
    const note =
      result.status === "online"
        ? result.latencyMs != null
          ? `${result.latencyMs}ms`
          : "ok"
        : result.error
          ? result.latencyMs != null
            ? `${result.error} (${result.latencyMs}ms)`
            : result.error
          : result.latencyMs != null
            ? `${result.status} (${result.latencyMs}ms)`
            : result.status;

    return {
      name: p.name,
      model: p.model,
      status: result.status,
      latencyMs: result.latencyMs,
      dailyRequests: null,
      error: result.error,
      note,
      configured: hasConfig || Boolean(apiKey),
    };
  });

  const display = await Promise.all(probeJobs);

  const result: AgentHealthResult = {
    providers: display.map(({ note: _n, configured: _c, ...rest }) => rest),
    timestamp,
  };

  const anyOffline = display.some((p) => p.status === "offline");
  const allOffline =
    display.length > 0 && display.every((p) => p.status === "offline");
  const anyDegraded = display.some((p) => p.status === "degraded");

  if (opts.json) {
    formatJson(
      {
        ...result,
        providers: display.map((p) => ({
          name: p.name,
          model: p.model,
          status: p.status,
          configured: p.configured,
          note: p.note,
          latencyMs: p.latencyMs,
          dailyRequests: p.dailyRequests,
          error: p.error,
        })),
        probed: true,
        timeoutMs,
      },
      opts
    );
  } else {
    formatTable(
      display.map((p) => ({
        Provider: p.name,
        Model: p.model,
        Status: p.status,
        Note: p.note,
      })),
      opts
    );

    if (allOffline) {
      formatSuccess(
        "All providers offline — missing keys or probes failed",
        opts
      );
    } else if (anyOffline) {
      formatSuccess(
        "Some providers offline — check keys and network (degraded is non-fatal)",
        opts
      );
    } else if (anyDegraded) {
      formatSuccess("Providers reachable; some degraded (non-fatal)", opts);
    } else {
      formatSuccess("All providers online", opts);
    }
  }

  // Exit 1 if any offline (missing key or probe failed).
  // Degraded is non-fatal (exit 0) unless all offline (already covered by anyOffline).
  if (anyOffline) {
    process.exitCode = ExitCode.ERROR;
  }
}

export function registerAgentCommand(program: Command): void {
  const agentCmd = program
    .command("agent")
    .summary("AI agent operations and health checks")
    .description(
      `Manage AI agent configuration and check provider health.

SUBCOMMANDS:
  health       Check the health of all AI model providers

EXAMPLES:
  hoox agent health                 Config check only (fast, no network)
  hoox agent health --probe         Live provider probes
  hoox agent health --probe --json  Machine-readable probe results
  hoox agent health --json`
    );

  agentCmd
    .command("health")
    .summary("Check AI model provider health")
    .description(
      `Check the health of all configured AI model providers.

By default, only checks whether API keys are present in environment
variables or the agent-worker .dev.vars file (no network calls).

Pass --probe to run a cheap live HTTP check per provider that has a key.

Supported providers:
  - Workers AI
  - OpenAI
  - Anthropic
  - Google AI
  - Azure OpenAI

EXAMPLES:
  hoox agent health
  hoox agent health --json
  hoox agent health --probe
  hoox agent health --probe --timeout 5000`
    )
    .option(
      "--probe",
      "Run cheap live HTTP checks for each provider with a configured key"
    )
    .option(
      "--timeout <ms>",
      "Per-provider probe timeout in milliseconds",
      String(DEFAULT_PROBE_TIMEOUT_MS)
    )
    .action(
      withErrorHandling(
        async (
          options: { probe?: boolean; timeout?: string },
          cmd: Command
        ) => {
          const fmt = getFormatOptions(cmd);
          const timeoutRaw = options.timeout;
          const timeout =
            timeoutRaw !== undefined
              ? Number.parseInt(String(timeoutRaw), 10)
              : DEFAULT_PROBE_TIMEOUT_MS;
          await handleHealth({
            ...fmt,
            probe: Boolean(options.probe),
            timeout: Number.isFinite(timeout)
              ? timeout
              : DEFAULT_PROBE_TIMEOUT_MS,
          });
        },
        { service: "agent" }
      )
    );
}
