/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `hoox waf` command — Cloudflare WAF (Web Application Firewall) management.
 *
 * Subcommands:
 *   waf status                 Show WAF status for the zone
 *   waf rules list             List all active firewall rules
 *   waf rules add <type> <value>  Add a WAF rule
 *   waf rules remove <id>      Remove a WAF rule by ID
 *   waf mode enable            Enable WAF protection
 *   waf mode disable           Disable WAF protection
 */

import type { Command } from "commander";
import { CloudflareService } from "../../services/cloudflare/cloudflare-service.js";
import type { WranglerResult } from "../../services/cloudflare/types.js";
import { CLIError, ExitCode } from "../../utils/errors.js";
import {
  formatSuccess,
  formatTable,
  getFormatOptions,
} from "../../utils/formatters.js";
import { withErrorHandling } from "../../utils/error-handler.js";
import { theme, icons } from "../../utils/theme.js";
import type { FormatOptions } from "../../utils/formatters.js";
import type { WafStatus, WafRule, WafRuleInput } from "./types.js";

// ---------------------------------------------------------------------------
// Cloudflare API helpers
// ---------------------------------------------------------------------------

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

/**
 * Reads the Cloudflare API token and account ID from environment variables.
 * Required for direct REST API calls (wrangler doesn't have native WAF commands).
 */
function getCredentials(): { token: string; accountId: string } {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token) {
    throw new CLIError(
      "CLOUDFLARE_API_TOKEN environment variable is not set. Set it or run `wrangler login`.",
      ExitCode.ERROR
    );
  }
  if (!accountId) {
    throw new CLIError(
      "CLOUDFLARE_ACCOUNT_ID environment variable is not set.",
      ExitCode.ERROR
    );
  }
  return { token, accountId };
}

/**
 * Makes an authenticated request to the Cloudflare REST API.
 * Returns a WranglerResult-style discriminated union for consistent error handling.
 */
async function cfApi<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown
): Promise<WranglerResult<T>> {
  const { token } = getCredentials();
  const url = `${CF_API_BASE}${path}`;

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const json = (await response.json()) as {
      success: boolean;
      result: T;
      errors: Array<{ message: string }>;
    };

    if (!response.ok || !json.success) {
      const errorMsg =
        json.errors?.map((e) => e.message).join("; ") ||
        `HTTP ${response.status}`;
      return { ok: false, error: errorMsg };
    }

    return { ok: true, value: json.result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Cloudflare API request failed: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// WAF API operations
// ---------------------------------------------------------------------------

interface CfWafSetting {
  id: string;
  value: string;
}

interface CfFirewallRule {
  id: string;
  description: string;
  action: string;
  filter: { id: string; expression: string };
  created_on: string;
  modified_on: string;
}

interface CfAnalyticsOverview {
  totals: {
    threats: number;
  };
}

/**
 * Builds expression from rule type and value.
 *   ip-allowlist → (ip.src eq {value})
 *   ip-blocklist → (ip.src eq {value})
 *   rate-limit  → handled as custom with rate-limit expression
 *   custom      → uses value as raw expression
 */
function buildExpression(type: WafRuleInput["type"], value: string): string {
  switch (type) {
    case "ip-allowlist":
      return `(ip.src eq ${value})`;
    case "ip-blocklist":
      return `(ip.src eq ${value})`;
    case "rate-limit":
      // Rate limiting is configured via a separate API; here we build a
      // basic rate-limit expression that can be extended.
      return `(http.request.uri.path contains "/")`;
    case "custom":
      return value;
  }
}

/**
 * Maps rule type and value to a Cloudflare firewall rule action.
 */
function mapAction(type: WafRuleInput["type"]): string {
  switch (type) {
    case "ip-allowlist":
      return "allow";
    case "ip-blocklist":
      return "block";
    case "rate-limit":
      return "managed_challenge";
    case "custom":
      return "block";
  }
}

/**
 * Fetches the Cloudflare zone to operate on. Uses CloudflareService.zonesList()
 * and picks the first zone. Falls back to env CLOUDFLARE_ZONE_ID.
 */
async function resolveZone(
  cf: CloudflareService
): Promise<{ id: string; name: string }> {
  // Try explicit env var first
  if (process.env.CLOUDFLARE_ZONE_ID) {
    return {
      id: process.env.CLOUDFLARE_ZONE_ID,
      name: process.env.CLOUDFLARE_ZONE_ID,
    };
  }

  const result = await cf.zonesList();
  if (!result.ok) {
    throw new CLIError(`Failed to list zones: ${result.error}`, ExitCode.ERROR);
  }

  // wrangler zones list outputs lines like "zone-name (zone-id)"
  const lines = result.value.split("\n").filter(Boolean);
  if (lines.length === 0) {
    throw new CLIError(
      "No zones found. Set CLOUDFLARE_ZONE_ID environment variable.",
      ExitCode.ERROR
    );
  }

  // Parse first zone: "domain.com (abc123...)"
  const match = lines[0].match(/^(.+?)\s+\((.+?)\)\s*$/);
  if (match) {
    return { name: match[1], id: match[2] };
  }

  // Fallback: use the first line as ID
  return { name: lines[0], id: lines[0] };
}

// ---------------------------------------------------------------------------
// Command action: waf status
// ---------------------------------------------------------------------------

async function handleStatus(opts: FormatOptions): Promise<void> {
  const cf = new CloudflareService();

  const zone = await resolveZone(cf);

  // Fetch WAF setting
  const wafResult = await cfApi<CfWafSetting>(
    "GET",
    `/zones/${zone.id}/settings/waf`
  );
  if (!wafResult.ok) {
    throw new CLIError(
      `Failed to get WAF status: ${wafResult.error}`,
      ExitCode.ERROR
    );
  }

  // Fetch firewall rules count
  const rulesResult = await cfApi<CfFirewallRule[]>(
    "GET",
    `/zones/${zone.id}/firewall/rules?per_page=50`
  );
  const activeRulesCount = rulesResult.ok ? rulesResult.value.length : 0;

  // Fetch recent blocks (last 24h analytics overview)
  let recentBlocks = 0;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const analyticsResult = await cfApi<CfAnalyticsOverview>(
    "GET",
    `/zones/${zone.id}/analytics/dashboard?since=${encodeURIComponent(since)}&continuous=true`
  );
  if (analyticsResult.ok) {
    recentBlocks = analyticsResult.value.totals?.threats ?? 0;
  }

  const status: WafStatus = {
    enabled: wafResult.value.value === "on",
    mode: wafResult.value.value,
    activeRulesCount,
    recentBlocks,
    zoneId: zone.id,
    zoneName: zone.name,
  };

  if (opts.json) {
    process.stdout.write(JSON.stringify(status, null, 2) + "\n");
    return;
  }

  process.stdout.write(theme.heading(`\nWAF status for ${zone.name}\n\n`));

  const colorFn = status.enabled ? theme.success : theme.error;
  process.stdout.write(
    `  Status:  ${colorFn(status.enabled ? `${icons.success} ENABLED` : `${icons.error} DISABLED`)}\n`
  );
  process.stdout.write(`  Mode:    ${status.mode}\n`);
  process.stdout.write(`  Rules:   ${status.activeRulesCount} active\n`);
  process.stdout.write(`  Blocks:  ${status.recentBlocks} (last 24h)\n`);
  process.stdout.write(`  Zone ID: ${theme.dim(zone.id)}\n\n`);
}

// ---------------------------------------------------------------------------
// Command action: waf rules list
// ---------------------------------------------------------------------------

async function handleRulesList(opts: FormatOptions): Promise<void> {
  const cf = new CloudflareService();
  const zone = await resolveZone(cf);

  const result = await cfApi<CfFirewallRule[]>(
    "GET",
    `/zones/${zone.id}/firewall/rules?per_page=50`
  );
  if (!result.ok) {
    throw new CLIError(
      `Failed to list firewall rules: ${result.error}`,
      ExitCode.ERROR
    );
  }

  const rules: WafRule[] = result.value.map((r) => ({
    id: r.id,
    description: r.description,
    mode: r.action,
    expression: r.filter?.expression ?? "(unknown)",
    created_at: r.created_on,
    updated_at: r.modified_on,
  }));

  if (opts.json) {
    process.stdout.write(JSON.stringify(rules, null, 2) + "\n");
    return;
  }

  if (rules.length === 0) {
    process.stdout.write(
      `${theme.dim(`${icons.info}  No firewall rules configured.\n`)}`
    );
    return;
  }

  process.stdout.write(theme.heading(`\nWAF rules for ${zone.name}\n\n`));

  const rows = rules.map((r) => ({
    ID: r.id.substring(0, 8) + "...",
    Description: r.description || "(no description)",
    Mode: r.mode,
    Expression:
      r.expression.length > 40
        ? r.expression.substring(0, 37) + "..."
        : r.expression,
  }));

  formatTable(rows, opts);
}

// ---------------------------------------------------------------------------
// Command action: waf rules add
// ---------------------------------------------------------------------------

async function handleRulesAdd(
  type: string,
  value: string,
  opts: FormatOptions
): Promise<void> {
  const validTypes = ["ip-allowlist", "ip-blocklist", "rate-limit", "custom"];
  if (!validTypes.includes(type)) {
    throw new CLIError(
      `Invalid rule type "${type}". Must be one of: ${validTypes.join(", ")}`,
      ExitCode.INVALID_USAGE
    );
  }

  const ruleInput: WafRuleInput = {
    type: type as WafRuleInput["type"],
    value,
  };

  const cf = new CloudflareService();
  const zone = await resolveZone(cf);

  const expression = buildExpression(ruleInput.type, value);
  const action = mapAction(ruleInput.type);

  const body = {
    description: ruleInput.description ?? `${ruleInput.type} rule for ${value}`,
    action,
    filter: { expression },
  };

  // Create filter first, then rule referencing the filter
  const filterResult = await cfApi<{ id: string }>(
    "POST",
    `/zones/${zone.id}/filters`,
    { expression }
  );
  if (!filterResult.ok) {
    throw new CLIError(
      `Failed to create filter: ${filterResult.error}`,
      ExitCode.ERROR
    );
  }

  const ruleBody = {
    description: body.description,
    action,
    filter: { id: filterResult.value.id },
  };

  const ruleResult = await cfApi<CfFirewallRule>(
    "POST",
    `/zones/${zone.id}/firewall/rules`,
    [ruleBody] // Cloudflare expects an array of rules
  );
  if (!ruleResult.ok) {
    throw new CLIError(
      `Failed to create firewall rule: ${ruleResult.error}`,
      ExitCode.ERROR
    );
  }

  // Cloudflare returns an array of created rules
  const created = Array.isArray(ruleResult.value)
    ? (ruleResult.value[0] as unknown as CfFirewallRule)
    : (ruleResult.value as unknown as CfFirewallRule);

  formatSuccess(
    `WAF rule added (${created.id}) — ${created.action} for "${value}"`,
    opts
  );
}

// ---------------------------------------------------------------------------
// Command action: waf rules remove
// ---------------------------------------------------------------------------

async function handleRulesRemove(
  ruleId: string,
  opts: FormatOptions
): Promise<void> {
  const cf = new CloudflareService();
  const zone = await resolveZone(cf);

  const result = await cfApi<{ id: string }>(
    "DELETE",
    `/zones/${zone.id}/firewall/rules/${ruleId}`
  );
  if (!result.ok) {
    throw new CLIError(
      `Failed to remove firewall rule: ${result.error}`,
      ExitCode.ERROR
    );
  }

  formatSuccess(`WAF rule ${ruleId} removed`, opts);
}

// ---------------------------------------------------------------------------
// Command action: waf mode enable / disable
// ---------------------------------------------------------------------------

async function handleMode(
  mode: "on" | "off",
  opts: FormatOptions
): Promise<void> {
  const cf = new CloudflareService();
  const zone = await resolveZone(cf);

  const result = await cfApi<CfWafSetting>(
    "PATCH",
    `/zones/${zone.id}/settings/waf`,
    { value: mode }
  );
  if (!result.ok) {
    throw new CLIError(
      `Failed to ${mode === "on" ? "enable" : "disable"} WAF: ${result.error}`,
      ExitCode.ERROR
    );
  }

  const label = mode === "on" ? "enabled" : "disabled";
  formatSuccess(`WAF ${label} on zone ${zone.name}`, opts);
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

/**
 * Registers the `hoox waf` command and all subcommands on the given
 * Commander.js program instance.
 */
export function registerWafCommand(program: Command): void {
  const waf = program
    .command("waf")
    .description("Manage Cloudflare WAF (Web Application Firewall)");

  // -- waf status ------------------------------------------------------------
  waf
    .command("status")
    .description(
      "Show WAF status (enabled/disabled, active rules, recent blocks)"
    )
    .action(
      withErrorHandling(
        async (_, cmd: Command) => {
          const opts = getFormatOptions(cmd);
          await handleStatus(opts);
        },
        { service: "waf" }
      )
    );

  // -- waf rules -------------------------------------------------------------
  const rules = waf.command("rules").description("Manage WAF firewall rules");

  rules
    .command("list")
    .description("List all WAF firewall rules")
    .action(
      withErrorHandling(
        async (_, cmd: Command) => {
          const opts = getFormatOptions(cmd);
          await handleRulesList(opts);
        },
        { service: "waf" }
      )
    );

  rules
    .command("add <type> <value>")
    .description(
      "Add a WAF rule. Types: ip-allowlist, ip-blocklist, rate-limit, custom"
    )
    .action(
      withErrorHandling(
        async (type: string, value: string, _, cmd: Command) => {
          const opts = getFormatOptions(cmd);
          await handleRulesAdd(type, value, opts);
        },
        { service: "waf" }
      )
    );

  rules
    .command("remove <ruleId>")
    .description("Remove a WAF rule by ID")
    .action(
      withErrorHandling(
        async (ruleId: string, _, cmd: Command) => {
          const opts = getFormatOptions(cmd);
          await handleRulesRemove(ruleId, opts);
        },
        { service: "waf" }
      )
    );

  // -- waf mode --------------------------------------------------------------
  const mode = waf
    .command("mode")
    .description("Enable or disable WAF protection");

  mode
    .command("enable")
    .description("Enable WAF protection on the zone")
    .action(
      withErrorHandling(
        async (_, cmd: Command) => {
          const opts = getFormatOptions(cmd);
          await handleMode("on", opts);
        },
        { service: "waf" }
      )
    );

  mode
    .command("disable")
    .description("Disable WAF protection on the zone")
    .action(
      withErrorHandling(
        async (_, cmd: Command) => {
          const opts = getFormatOptions(cmd);
          await handleMode("off", opts);
        },
        { service: "waf" }
      )
    );
}
