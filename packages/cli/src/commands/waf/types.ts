/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Waf command type definitions.
 */

/** WAF status summary returned by `hoox waf status`. */
export interface WafStatus {
  /** Whether WAF protection is enabled on the zone. */
  enabled: boolean;
  /** WAF mode (e.g. "on", "off", "simulate"). */
  mode: string;
  /** Number of active firewall rules on the zone. */
  activeRulesCount: number;
  /** Approximate count of recent blocked requests (last 24h). */
  recentBlocks: number;
  /** Cloudflare zone ID. */
  zoneId: string;
  /** Cloudflare zone name (domain). */
  zoneName: string;
}

/** A Cloudflare WAF / firewall rule. */
export interface WafRule {
  /** Unique rule identifier. */
  id: string;
  /** Human-readable description of the rule. */
  description: string;
  /** Rule mode: "block", "challenge", "js_challenge", "allow", "log". */
  mode: string;
  /** Cloudflare Filters expression that triggers the rule. */
  expression: string;
  /** ISO 8601 creation timestamp. */
  created_at: string;
  /** ISO 8601 last-modified timestamp. */
  updated_at: string;
}

/** WAF toggle mode. */
export type WafMode = "on" | "off";

/** Input for creating a new WAF rule. */
export interface WafRuleInput {
  /** Rule type: "ip-allowlist", "ip-blocklist", "rate-limit", "custom". */
  type: "ip-allowlist" | "ip-blocklist" | "rate-limit" | "custom";
  /** Value associated with the rule type (IP address, requests/period, etc.). */
  value: string;
  /** Optional human-readable description. */
  description?: string;
}
