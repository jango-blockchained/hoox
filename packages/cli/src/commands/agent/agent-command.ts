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

interface ProviderHealth {
  name: string;
  model: string;
  status: "online" | "degraded" | "offline";
  latencyMs: number | null;
  dailyRequests: number | null;
  error?: string;
}

interface AgentHealthResult {
  providers: ProviderHealth[];
  timestamp: string;
}

const PROVIDERS: { name: string; model: string; envVar: string }[] = [
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

function checkEnvVar(name: string): string | null {
  try {
    const val = process.env[name];
    if (val && val.length > 0) return val;
  } catch {
    // intentionally ignored — env var access should not throw, but be defensive
  }
  return null;
}

function checkDevVars(): Record<string, string> {
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

async function handleHealth(opts: FormatOptions): Promise<void> {
  const configured = getConfiguredKeys();
  const timestamp = new Date().toISOString();
  const providers: ProviderHealth[] = [];

  for (const p of PROVIDERS) {
    const hasKey =
      configured.has(p.envVar) || configured.has("AGENT_INTERNAL_KEY");

    if (!hasKey && p.name === "Workers AI") {
      const cfToken = checkEnvVar("CLOUDFLARE_API_TOKEN");
      if (!cfToken) {
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
    }

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

  // Relabel for honesty: "configured" vs live online
  const display = providers.map((p) => ({
    ...p,
    status: p.status === "online" ? ("online" as const) : ("offline" as const),
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
  hoox agent health           Check AI provider health (human-readable)
  hoox agent health --json    Machine-readable JSON output`
    );

  agentCmd
    .command("health")
    .summary("Check AI model provider health")
    .description(
      `Check the health of all configured AI model providers.

Reads provider API keys from environment variables or the
agent-worker .dev.vars file and reports their status.

Supported providers:
  - Workers AI
  - OpenAI
  - Anthropic
  - Google AI
  - Azure OpenAI

EXAMPLES:
  hoox agent health
  hoox agent health --json`
    )
    .action(
      withErrorHandling(
        async (_: unknown, cmd: Command) => {
          const opts = getFormatOptions(cmd);
          await handleHealth(opts);
        },
        { service: "agent" }
      )
    );
}
