/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Trace service — Cloudflare Workers Observability API client.
 * Handles authentication and API calls for trace queries, keys, values,
 * destinations, and usage statistics.
 */

import { CLIError, ExitCode } from "../../utils/errors.js";
import type {
  TraceQueryRequest,
  TraceQueryResponse,
  TraceKeysResponse,
  TraceValuesResponse,
  TraceDestination,
  TraceDestinationInput,
  TraceUsage,
  TraceEvent,
  LiveTailSession,
} from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

// ---------------------------------------------------------------------------
// Raw API response types (Cloudflare Observability returns different shapes
// than the public OpenAPI spec suggests — these match the live API).
// ---------------------------------------------------------------------------

type RawEvent = {
  dataset?: string;
  timestamp?: number | string;
  $metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

type RawAggregate = {
  value?: number | string;
  interval?: number;
  sampleInterval?: number;
  count?: number;
};

type RawCalculation = {
  calculation: string;
  aggregates?: RawAggregate[];
  series?: Array<{ time: string; data: RawAggregate[] }>;
  groupBy?: Record<string, string | number>;
};

type RawKey = {
  key: string;
  type: "string" | "number" | "boolean";
  lastSeenAt?: number;
  description?: string;
};

type RawValue = {
  key: string;
  type: "string" | "number" | "boolean";
  value: string | number | boolean;
  dataset?: string;
};

type RawUsage = {
  events: number;
  breakdown?: Array<{
    bin: string;
    dataset: string;
    service: string;
    count: number;
  }>;
};

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

/**
 * Reads the Cloudflare API token and account ID from environment variables.
 * Required for direct REST API calls.
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

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

/**
 * Makes an authenticated request to the Cloudflare REST API.
 * Returns the result or throws a CLIError on failure.
 */
async function cfApi<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  query?: Record<string, string | number | boolean | undefined>
): Promise<T> {
  const { token } = getCredentials();

  let url = `${CF_API_BASE}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

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
      errors: Array<{ code: number; message: string }>;
      messages: Array<{ code: number; message: string }>;
    };

    if (!response.ok || !json.success) {
      const errorMsg =
        json.errors?.map((e) => e.message).join("; ") ||
        `HTTP ${response.status}`;
      throw new CLIError(`Cloudflare API error: ${errorMsg}`, ExitCode.ERROR);
    }

    return json.result;
  } catch (err) {
    if (err instanceof CLIError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new CLIError(
      `Cloudflare API request failed: ${message}`,
      ExitCode.ERROR
    );
  }
}

// ---------------------------------------------------------------------------
// TraceService class
// ---------------------------------------------------------------------------

/**
 * Service for interacting with Cloudflare Workers Observability API.
 * Provides methods for querying traces, managing destinations, and more.
 */
export class TraceService {
  private accountId: string;

  constructor() {
    const { accountId } = getCredentials();
    this.accountId = accountId;
  }

  // -------------------------------------------------------------------------
  // Query methods
  // -------------------------------------------------------------------------

  /**
   * Run a trace query (events, calculations, or invocations view).
   * The Cloudflare API returns a nested envelope — for the `events` view
   * the events live at `result.events.events`; for `calculations` at
   * `result.calculations` (with `aggregates` and `series`). This method
   * normalises the response to the flat `TraceQueryResponse` shape used
   * by the CLI.
   */
  async query(request: TraceQueryRequest): Promise<TraceQueryResponse> {
    const path = `/accounts/${this.accountId}/workers/observability/telemetry/query`;
    type Raw = {
      run?: unknown;
      events?: { events?: RawEvent[] };
      calculations?: RawCalculation[];
    };
    const result = (await cfApi<Raw>("POST", path, request)) as Raw;

    if (request.view === "events") {
      const events = (result.events?.events ?? []) as unknown as TraceEvent[];
      return { success: true, events };
    }

    if (request.view === "calculations") {
      const metrics = (result.calculations ?? []).map((c) => ({
        calculations: (c.aggregates ?? []).map((a) => ({
          alias: c.calculation,
          value: typeof a.value === "number" ? a.value : Number(a.value ?? 0),
        })),
        groupBy: c.groupBy,
      }));
      return { success: true, metrics };
    }

    return { success: true };
  }

  /**
   * Query trace events (spans) with filters.
   */
  async queryEvents(options: {
    service?: string;
    trigger?: string;
    level?: string;
    limit?: number;
    from?: number;
    to?: number;
  }): Promise<TraceQueryResponse> {
    const filters = [];
    if (options.service) {
      filters.push({
        key: "$metadata.service",
        operation: "eq" as const,
        type: "string" as const,
        value: options.service,
      });
    }
    if (options.trigger) {
      filters.push({
        key: "$metadata.trigger",
        operation: "includes" as const,
        type: "string" as const,
        value: options.trigger,
      });
    }
    if (options.level) {
      filters.push({
        key: "$metadata.level",
        operation: "eq" as const,
        type: "string" as const,
        value: options.level,
      });
    }

    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    const request: TraceQueryRequest = {
      view: "events",
      queryId: "trace-events",
      limit: options.limit ?? 50,
      parameters: {
        filters,
      },
      timeframe: {
        from: options.from ?? oneHourAgo,
        to: options.to ?? now,
      },
    };

    return this.query(request);
  }

  /**
   * Query trace metrics (calculations view).
   */
  async queryMetrics(options: {
    service?: string;
    calculations?: Array<{
      operator: string;
      key?: string;
      alias?: string;
    }>;
    groupBy?: string;
    from?: number;
    to?: number;
  }): Promise<TraceQueryResponse> {
    const filters = [];
    if (options.service) {
      filters.push({
        key: "$metadata.service",
        operation: "eq" as const,
        type: "string" as const,
        value: options.service,
      });
    }

    const calculations = (options.calculations ?? [{ operator: "count" }]).map(
      (c) => ({
        operator:
          c.operator as TraceQueryRequest["parameters"]["calculations"] extends
            | (infer U)[]
            | undefined
            ? U extends { operator: infer O }
              ? O
              : never
            : never,
        key: c.key,
        keyType: c.key ? ("number" as const) : undefined,
        alias: c.alias ?? c.operator,
      })
    );

    const groupBys = options.groupBy
      ? [{ type: "string" as const, value: options.groupBy }]
      : [];

    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    const request: TraceQueryRequest = {
      view: "calculations",
      queryId: "trace-metrics",
      parameters: {
        filters,
        calculations:
          calculations as TraceQueryRequest["parameters"]["calculations"],
        groupBys,
      },
      timeframe: {
        from: options.from ?? oneHourAgo,
        to: options.to ?? now,
      },
    };

    return this.query(request);
  }

  // -------------------------------------------------------------------------
  // Keys and values
  // -------------------------------------------------------------------------

  /**
   * List available filter keys for trace queries.
   * The Cloudflare API expects `needle` as an object `{value, isRegex, matchCase}`,
   * not a plain string — sending a string causes HTTP 400.
   * The response `result` is **the array itself** (not wrapped in `{keys:[]}`).
   */
  async listKeys(options?: {
    needle?: string;
    limit?: number;
  }): Promise<TraceKeysResponse> {
    const path = `/accounts/${this.accountId}/workers/observability/telemetry/keys`;
    const body = {
      needle: options?.needle
        ? { value: options.needle, isRegex: false, matchCase: false }
        : undefined,
      limit: options?.limit ?? 100,
    };
    const raw = await cfApi<RawKey[]>("POST", path, body);
    return { keys: raw };
  }

  /**
   * List available values for a specific filter key.
   * Note: the OpenAPI spec for the values endpoint omits the required
   * `type` and `datasets` fields, but the live API returns HTTP 400
   * (`ZodError`) if either is missing. We always send them.
   * The response `result` is an array of `{key, type, value, dataset}` —
   * we extract `.value` to match the documented CLI shape.
   */
  async listValues(options: {
    key: string;
    type?: "string" | "number" | "boolean";
    limit?: number;
    from?: number;
    to?: number;
  }): Promise<TraceValuesResponse> {
    const path = `/accounts/${this.accountId}/workers/observability/telemetry/values`;

    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    const body = {
      key: options.key,
      type: options.type ?? "string",
      datasets: [] as string[],
      limit: options.limit ?? 50,
      timeframe: {
        from: options.from ?? oneHourAgo,
        to: options.to ?? now,
      },
    };
    const raw = await cfApi<RawValue[]>("POST", path, body);
    return { values: raw.map((v) => v.value) };
  }

  // -------------------------------------------------------------------------
  // Destinations
  // -------------------------------------------------------------------------

  /**
   * List all OTLP export destinations.
   */
  async listDestinations(): Promise<TraceDestination[]> {
    const path = `/accounts/${this.accountId}/workers/observability/destinations`;
    return cfApi<TraceDestination[]>("GET", path);
  }

  /**
   * Create a new OTLP export destination.
   */
  async createDestination(
    input: TraceDestinationInput
  ): Promise<TraceDestination> {
    const path = `/accounts/${this.accountId}/workers/observability/destinations`;
    return cfApi<TraceDestination>("POST", path, input);
  }

  /**
   * Delete an OTLP export destination by slug.
   */
  async deleteDestination(slug: string): Promise<void> {
    const path = `/accounts/${this.accountId}/workers/observability/destinations/${slug}`;
    await cfApi<void>("DELETE", path);
  }

  // -------------------------------------------------------------------------
  // Usage
  // -------------------------------------------------------------------------

  /**
   * Get observability usage statistics (event counts).
   * The Cloudflare API requires `from` and `to` as query parameters
   * (Unix timestamps in **milliseconds**). The API caps the range at 7 days,
   * so the default range is the last 7 days.
   * The response `result` is `{events: number, breakdown: [{bin, dataset, service, count}]}`;
   * we collapse the breakdown into a `byWorker` map for display.
   */
  async getUsage(options?: {
    from?: number;
    to?: number;
  }): Promise<TraceUsage> {
    const path = `/accounts/${this.accountId}/workers/observability/usage`;
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const raw = await cfApi<RawUsage>("GET", path, undefined, {
      from: options?.from ?? sevenDaysAgo,
      to: options?.to ?? now,
    });
    const byWorker: Record<string, number> = {};
    for (const row of raw.breakdown ?? []) {
      byWorker[row.service] = (byWorker[row.service] ?? 0) + row.count;
    }
    return {
      eventCount: raw.events,
      from: new Date(options?.from ?? sevenDaysAgo).toISOString(),
      to: new Date(options?.to ?? now).toISOString(),
      byWorker,
    };
  }

  // -------------------------------------------------------------------------
  // Live tail
  // -------------------------------------------------------------------------

  /**
   * Prepare a live tail session for real-time trace streaming.
   */
  async prepareLiveTail(options?: {
    service?: string;
  }): Promise<LiveTailSession> {
    const path = `/accounts/${this.accountId}/workers/observability/telemetry/live-tail`;
    const body = {
      filters: options?.service
        ? [
            {
              key: "$metadata.service",
              operation: "eq",
              type: "string",
              value: options.service,
            },
          ]
        : [],
    };
    return cfApi<LiveTailSession>("POST", path, body);
  }

  /**
   * Send heartbeat to keep live tail session alive.
   */
  async liveTailHeartbeat(sessionId: string): Promise<void> {
    const path = `/accounts/${this.accountId}/workers/observability/telemetry/live-tail/heartbeat`;
    await cfApi<void>("POST", path, { sessionId });
  }
}
