/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

// workers/dashboard/src/lib/settings/workers.ts
//
// Single source of truth for the canonical worker list that the dashboard
// knows about. Used by:
//   - src/app/api/workers/health/route.ts (per-worker health check)
//   - src/components/dashboard/settings-form.tsx ("Connected Workers" card)
//
// Adding a new worker = add an entry here. The settings loader
// (loader.ts) still has its own BUILTIN_CONFIGS map for jsonc fetching —
// see TODO-LOADER-DEDUPE in session notes.

export interface WorkerListEntry {
  /** Canonical worker name (matches wrangler.jsonc name) */
  name: string;
  /** Display name shown in the UI */
  displayName: string;
  /**
   * The default KV prefix this worker would write to. The health
   * check uses this to confirm CONFIG_KV is reachable on the worker's
   * behalf (workers share a single CONFIG_KV, so any prefix works).
   */
  defaultPrefix: string;
  /** Whether the worker is "connected" in the UI sense */
  enabled: boolean;
}

export const DEFAULT_WORKER_LIST: readonly WorkerListEntry[] = [
  {
    name: "hoox",
    displayName: "Gateway",
    defaultPrefix: "global:",
    enabled: true,
  },
  {
    name: "trade-worker",
    displayName: "Trade Worker",
    defaultPrefix: "trade:",
    enabled: true,
  },
  {
    name: "d1-worker",
    displayName: "D1 Worker",
    defaultPrefix: "database:",
    enabled: true,
  },
  {
    name: "agent-worker",
    displayName: "Agent Worker",
    defaultPrefix: "agent:",
    enabled: true,
  },
  {
    name: "telegram-worker",
    displayName: "Telegram Worker",
    defaultPrefix: "bot:",
    enabled: true,
  },
  {
    name: "email-worker",
    displayName: "Email Worker",
    defaultPrefix: "email:",
    enabled: true,
  },
  {
    name: "web3-wallet-worker",
    displayName: "Web3 Wallet",
    defaultPrefix: "wallet:",
    enabled: true,
  },
  // The two workers below have a `dashboard.jsonc` source but were missing
  // CONFIG_KV bindings until the audit remediation. They're listed here
  // with the "analytics:" and "report:" default prefixes; the health
  // endpoint will show them green once the submodule PRs deploy.
  {
    name: "analytics-worker",
    displayName: "Analytics Worker",
    defaultPrefix: "ai:",
    enabled: true,
  },
  {
    name: "report-worker",
    displayName: "Report Worker",
    defaultPrefix: "cron:",
    enabled: true,
  },
];
