/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { toError } from "@jango-blockchained/hoox-shared/errors";
import type { HousekeepingPayload } from "@jango-blockchained/hoox-shared/types";
import { z } from "zod";
import { getInternalAuthKeys } from "./config";

function getApiUrl(key: string): string {
  const envKey = `${key}_URL`;
  const envUrl = process.env[envKey];
  if (envUrl) return envUrl;

  const defaultUrls: Record<string, string> = {
    d1Service: "https://d1-worker.cryptolinx.workers.dev",
    tradeService: "https://trade-worker.cryptolinx.workers.dev",
    agentService: "https://agent-worker.cryptolinx.workers.dev",
    telegramService: "https://telegram-worker.cryptolinx.workers.dev",
  };

  return defaultUrls[key] || "";
}

export interface DashboardStats {
  totalTrades: number;
  openPositions: number;
  winRate: string;
}

export interface Position {
  /** D1 position id — live: `{ex}-{sym}-{side}`; testnet: `{ex}-testnet-{sym}-{side}`. */
  id: string | number;
  exchange: string;
  symbol: string;
  side: string;
  size: number;
  entryPrice: number;
  currentPrice?: number;
  unrealizedPnl?: number;
  leverage: number;
  status: "OPEN" | "CLOSED";
  openedAt: number;
  updatedAt: number;
}

/** True when the position ledger row was opened via `test: true` trading. */
export function isTestnetPosition(
  position: Pick<Position, "id"> | { id?: string | number }
): boolean {
  return String(position.id ?? "").includes("-testnet-");
}

export interface SystemLog {
  id: number;
  level: string;
  message: string;
  timestamp: number;
  source?: string;
}

export interface Report {
  id: string;
  key: string;
  name: string;
  size: number;
  createdAt: string;
  type: "pdf" | "csv";
}

// Zod v4 schemas for the /api/reports contract. The same shape is enforced
// at the network boundary in workers/dashboard/src/app/api/reports/route.ts.
const reportSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
  type: z.enum(["pdf", "csv"]),
});

const reportsResponseSchema = z.object({
  success: z.literal(true),
  reports: z.array(reportSchema),
});

export interface WorkerStatus {
  name: string;
  status: "healthy" | "degraded" | "down";
  latency?: number;
  lastCheck?: string;
}

class ApiClient {
  private d1ReadKey: string | undefined;
  private tradeExecuteKey: string | undefined;

  setInternalKey(key: string) {
    this.d1ReadKey = key;
  }

  setTradeExecuteKey(key: string) {
    this.tradeExecuteKey = key;
  }

  private authHeaders(key?: string): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (key) {
      headers["X-Internal-Auth-Key"] = key;
    }
    return headers;
  }

  private async fetchWithAuth<T>(
    endpoint: string,
    options: RequestInit = {},
    authKey?: string
  ): Promise<T> {
    const key = authKey ?? this.d1ReadKey;
    const headers: HeadersInit = {
      ...this.authHeaders(key),
      ...options.headers,
    };

    const response = await fetch(endpoint, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private asObject(value: unknown): Record<string, any> {
    return typeof value === "object" && value !== null
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (value as Record<string, any>)
      : {};
  }

  // Dashboard Stats
  async getStats(): Promise<{
    success: boolean;
    stats: DashboardStats;
    recentActivity: unknown[];
  }> {
    return this.fetchWithAuth<{
      success: boolean;
      stats: DashboardStats;
      recentActivity: unknown[];
    }>(`${getApiUrl("d1Service")}/api/dashboard/stats`);
  }

  // Positions
  async getPositions(): Promise<{ success: boolean; positions: Position[] }> {
    return this.fetchWithAuth<{ success: boolean; positions: Position[] }>(
      `${getApiUrl("d1Service")}/api/dashboard/positions`
    );
  }

  async closePosition(
    exchange: string,
    symbol: string,
    side: string,
    size: number,
    options?: { test?: boolean }
  ): Promise<{ success: boolean; error?: string }> {
    return this.fetchWithAuth<{ success: boolean; error?: string }>(
      `${getApiUrl("tradeService")}/webhook`,
      {
        method: "POST",
        body: JSON.stringify({
          exchange,
          symbol,
          action: side === "LONG" ? "CLOSE_LONG" : "CLOSE_SHORT",
          quantity: size,
          // Route close to the same environment the position was opened on.
          ...(options?.test ? { test: true } : {}),
        }),
      },
      this.tradeExecuteKey
    );
  }

  // Logs
  async getLogs(limit = 50): Promise<{ success: boolean; logs: SystemLog[] }> {
    const data = await this.fetchWithAuth(
      `${getApiUrl("d1Service")}/api/dashboard/logs?limit=${limit}`
    );
    const result = this.asObject(data);
    return { success: result?.success || false, logs: result?.logs || [] };
  }

  // Reports — proxied via the dashboard's own /api/reports route, which
  // eventually calls into report-worker. The response is Zod v4-validated
  // so a schema mismatch fails closed (returns an empty list) rather than
  // rendering untyped data.
  async getReports(): Promise<{ success: boolean; reports: Report[] }> {
    try {
      const data = await this.fetchWithAuth("/api/reports");
      const parsed = reportsResponseSchema.safeParse(data);
      if (parsed.success) {
        return { success: true, reports: parsed.data.reports };
      }
      console.warn("getReports: response did not match schema", {
        issues: parsed.error.issues.slice(0, 3),
      });
      return { success: false, reports: [] };
    } catch (e) {
      console.error("getReports: fetch failed", e);
      return { success: false, reports: [] };
    }
  }

  // Agent Status
  async getAgentStatus(): Promise<{
    success: boolean;
    status: string;
    config: unknown;
  }> {
    const data = await this.fetchWithAuth(
      `${getApiUrl("agentService")}/agent/status`
    );
    const result = this.asObject(data);
    return {
      success: result?.success || false,
      status: result?.status || "",
      config: result?.config,
    };
  }

  // Agent Health
  async getAgentHealth(): Promise<{ success: boolean; providers: unknown[] }> {
    const data = await this.fetchWithAuth(
      `${getApiUrl("agentService")}/agent/health`
    );
    const result = this.asObject(data);
    return {
      success: result?.success || false,
      providers: result?.providers || [],
    };
  }

  // Worker Health Check
  async checkWorkerHealth(
    workerName: string,
    url: string
  ): Promise<WorkerStatus> {
    const start = Date.now();
    try {
      const response = await fetch(`${url}/health`, { method: "GET" });
      const latency = Date.now() - start;
      return {
        name: workerName,
        status: response.ok ? "healthy" : "degraded",
        latency,
        lastCheck: new Date().toISOString(),
      };
    } catch {
      return {
        name: workerName,
        status: "down",
        latency: undefined,
        lastCheck: new Date().toISOString(),
      };
    }
  }

  // Get all worker statuses
  async getWorkersStatus(): Promise<WorkerStatus[]> {
    const workers = [
      { name: "d1-worker", url: getApiUrl("d1Service") },
      { name: "trade-worker", url: getApiUrl("tradeService") },
      { name: "agent-worker", url: getApiUrl("agentService") },
      { name: "telegram-worker", url: getApiUrl("telegramService") },
    ];

    return Promise.all(
      workers.map((w) => this.checkWorkerHealth(w.name, w.url))
    );
  }
  async getHousekeeping(): Promise<{
    timestamp?: string;
    checks?: unknown[];
    error?: string;
  }> {
    try {
      const response = await fetch("/api/housekeeping", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }
      const data = (await response.json()) as Record<string, unknown>;
      if (typeof data.timestamp === "string" && Array.isArray(data.issues)) {
        return data as unknown as HousekeepingPayload;
      }
      return { error: "Invalid housekeeping payload" };
    } catch (e) {
      return { error: toError(e) };
    }
  }

  async getSecretsStatus(): Promise<{
    success: boolean;
    secrets: { name: string; synced: boolean }[];
    error?: string;
  }> {
    return this.fetchWithAuth<{
      success: boolean;
      secrets: { name: string; synced: boolean }[];
      error?: string;
    }>("/api/secrets");
  }

  async syncSecretToPages(
    secretName: string,
    secretValue: string
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    return this.fetchWithAuth<{
      success: boolean;
      message?: string;
      error?: string;
    }>("/api/secrets", {
      method: "POST",
      body: JSON.stringify({
        action: "sync-to-pages",
        secretName,
        secretValue,
      }),
    });
  }

  // Database Explorer ─────────────────────────────────────────────────
  //
  // Static list of tables exposed by d1-worker. Mirrors the
  // TABLE_ALLOWLIST in workers/d1-worker/src/index.ts — keep in sync.
  // d1-worker does not expose a /schema endpoint today, so the dashboard
  // uses this static catalog. Callers should treat the result as a
  // best-effort catalog; the server is the source of truth.
  private static readonly DATABASE_TABLES = [
    "trade_signals",
    "trades",
    "positions",
    "balances",
    "system_logs",
    "trade_requests",
    "trade_responses",
  ] as const;

  private static readonly TableNameSchema = z.enum(ApiClient.DATABASE_TABLES);

  private static readonly TableInfoSchema = z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    d1Name: z.string().min(1),
    description: z.string(),
  });

  private static readonly DatabaseTablesResponseSchema = z.object({
    tables: z.array(ApiClient.TableInfoSchema),
  });

  private static readonly QueryResultRowSchema = z.record(
    z.string(),
    z.unknown()
  );

  private static readonly QueryResponseSchema = z.object({
    success: z.boolean(),
    results: z.array(ApiClient.QueryResultRowSchema).optional(),
    error: z.string().optional(),
  });

  /**
   * Returns the static catalog of D1 tables the dashboard can browse.
   * Validated with Zod v4 at the boundary (test-coverage.md).
   */
  getDatabaseTables(): {
    tables: {
      id: string;
      label: string;
      d1Name: string;
      description: string;
    }[];
  } {
    const tables = ApiClient.DatabaseTablesResponseSchema.parse({
      tables: [
        {
          id: "signals",
          label: "Signals",
          d1Name: "trade_signals",
          description: "Incoming trade signals from webhooks and email parsers",
        },
        {
          id: "positions",
          label: "Positions",
          d1Name: "positions",
          description:
            "Active and historical trading positions across exchanges",
        },
        {
          id: "trades",
          label: "Trades",
          d1Name: "trades",
          description:
            "Executed trade records linked to their originating signals",
        },
        {
          id: "agent_logs",
          label: "Agent Logs",
          d1Name: "system_logs",
          description: "Structured log entries from all workers and AI agents",
        },
      ],
    });
    return tables;
  }

  /**
   * Run a paginated read against d1-worker's /query endpoint.
   *
   * The endpoint requires the `X-Internal-Auth-Key` header. The internal
   * key is only available server-side (via scoped D1 read auth env vars),
   * so this method works when invoked from a Next.js Route Handler or
   * Server Component. In the browser, the request goes out without
   * the header and d1-worker returns 401 — the caller is expected to
   * surface that as a graceful empty state.
   *
   * Performs two queries in parallel:
   *   1. `SELECT COUNT(*) AS count FROM <name>`
   *   2. `SELECT * FROM <name> ORDER BY id DESC LIMIT ?`
   *
   * Both responses are Zod-validated at the boundary.
   */
  async queryTable(
    name: string,
    limit = 20
  ): Promise<{ count: number; rows: Record<string, unknown>[] }> {
    const validatedName = ApiClient.TableNameSchema.parse(name);
    // `limit` is a positive integer, capped server-side by d1-worker
    // via `bind()` parameter — no SQL injection risk.
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 1000);

    const endpoint = `${getApiUrl("d1Service")}/query`;
    const headers = this.authHeaders(this.d1ReadKey);

    const [countRes, rowsRes] = await Promise.all([
      fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          query: `SELECT COUNT(*) AS count FROM ${validatedName}`,
        }),
      }),
      fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          query: `SELECT * FROM ${validatedName} ORDER BY id DESC LIMIT ?`,
          params: [safeLimit],
        }),
      }),
    ]);

    if (!countRes.ok) {
      const body = (await countRes.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(
        body.error ??
          `Count query failed: ${countRes.status} ${countRes.statusText}`
      );
    }
    if (!rowsRes.ok) {
      const body = (await rowsRes.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(
        body.error ??
          `Rows query failed: ${rowsRes.status} ${rowsRes.statusText}`
      );
    }

    const countJson = ApiClient.QueryResponseSchema.parse(
      await countRes.json()
    );
    const rowsJson = ApiClient.QueryResponseSchema.parse(await rowsRes.json());

    const countValue = countJson.results?.[0]?.["count"];
    const count =
      typeof countValue === "number"
        ? countValue
        : typeof countValue === "string"
          ? Number.parseInt(countValue, 10) || 0
          : 0;

    return { count, rows: rowsJson.results ?? [] };
  }
}

export const api = new ApiClient();

const resolvedKeys = getInternalAuthKeys();
if (resolvedKeys.d1Read) {
  api.setInternalKey(resolvedKeys.d1Read);
}
if (resolvedKeys.tradeExecute) {
  api.setTradeExecuteKey(resolvedKeys.tradeExecute);
}
