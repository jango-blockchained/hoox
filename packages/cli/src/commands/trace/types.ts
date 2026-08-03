/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Trace command type definitions.
 * Types for Cloudflare Workers Observability API (traces, spans, destinations).
 */

// ---------------------------------------------------------------------------
// Query types
// ---------------------------------------------------------------------------

/** View type for observability queries. */
export type TraceView = "events" | "calculations" | "invocations";

/**
 * Timeframe for trace queries.
 * Cloudflare Observability API expects Unix timestamps in **milliseconds** as
 * numbers — NOT ISO-8601 strings. ISO strings cause HTTP 400.
 */
export interface TraceTimeframe {
  /** Start time (Unix timestamp in milliseconds, e.g. Date.now()). */
  from?: number;
  /** End time (Unix timestamp in milliseconds, e.g. Date.now()). */
  to?: number;
}

/** Filter operation for trace queries. */
export type FilterOperation =
  | "includes"
  | "not_includes"
  | "starts_with"
  | "regex"
  | "exists"
  | "is_null"
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte";

/** A single filter condition. */
export interface TraceFilter {
  /** Field name (e.g. "$metadata.service", "$metadata.trigger"). */
  key: string;
  /** Comparison operation. */
  operation: FilterOperation;
  /** Data type of the field. */
  type: "string" | "number" | "boolean";
  /** Comparison value. */
  value: string | number | boolean;
}

/** Calculation definition for metrics queries. */
export interface TraceCalculation {
  /** Aggregation operator. */
  operator:
    | "count"
    | "avg"
    | "sum"
    | "min"
    | "max"
    | "median"
    | "p90"
    | "p95"
    | "p99"
    | "uniq"
    | "stddev";
  /** Field to calculate over (omit for count). */
  key?: string;
  /** Data type of the field. */
  keyType?: "string" | "number" | "boolean";
  /** Optional label for the calculation. */
  alias?: string;
}

/** Group-by definition for metrics queries. */
export interface TraceGroupBy {
  /** Field to group by. */
  type: "string" | "number" | "boolean";
  /** Field name. */
  value: string;
}

/** Query parameters for the observability API. */
export interface TraceQueryParams {
  /** Datasets to query (empty = all). */
  datasets?: string[];
  /** Filter conditions. */
  filters?: TraceFilter[];
  /** Calculations for metrics view. */
  calculations?: TraceCalculation[];
  /** Group-by fields for metrics view. */
  groupBys?: TraceGroupBy[];
}

/** Full query request body. */
export interface TraceQueryRequest {
  /** Query view type. */
  view: TraceView;
  /** Unique query identifier. */
  queryId: string;
  /** Maximum events to return (events view). */
  limit?: number;
  /** Pagination cursor. */
  offset?: string;
  /** Query parameters. */
  parameters: TraceQueryParams;
  /** Time range. */
  timeframe: TraceTimeframe;
  /** Dry run (validate only). */
  dry?: boolean;
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/** Metadata attached to each trace event. */
export interface TraceMetadata {
  /** Unique event ID. */
  id?: string;
  /** Worker service name. */
  service?: string;
  /** Trigger type (fetch, scheduled, etc.). */
  origin?: string;
  /** Trigger path/endpoint. */
  trigger?: string;
  /** Log message. */
  message?: string;
  /** Log level. */
  level?: string;
  /** Error message if any. */
  error?: string;
  /** Request ID for correlation. */
  requestId?: string;
  /** Timestamp. */
  timestamp?: string;
}

/** A single trace event (span). */
export interface TraceEvent {
  /** Event metadata. */
  $metadata: TraceMetadata;
  /** Additional span attributes. */
  [key: string]: unknown;
}

/** Calculation result. */
export interface TraceCalculationResult {
  /** Calculation alias or operator name. */
  alias: string;
  /** Calculated value. */
  value: number;
}

/** Metrics query result. */
export interface TraceMetricsResult {
  /** Calculation results. */
  calculations: TraceCalculationResult[];
  /** Group-by values if grouped. */
  groupBy?: Record<string, string | number>;
}

/** Query response envelope. */
export interface TraceQueryResponse {
  /** Whether the query succeeded. */
  success: boolean;
  /** Events (for events view). */
  events?: TraceEvent[];
  /** Metrics (for calculations view). */
  metrics?: TraceMetricsResult[];
  /** Pagination cursor for next page. */
  nextOffset?: string;
  /** Total count if available. */
  totalCount?: number;
}

// ---------------------------------------------------------------------------
// Keys and values types
// ---------------------------------------------------------------------------

/** A filter key definition. */
export interface TraceKey {
  /** Key name (e.g. "$metadata.service"). */
  key: string;
  /** Data type. */
  type: "string" | "number" | "boolean";
  /** Description if available. */
  description?: string;
}

/** Response from keys endpoint. */
export interface TraceKeysResponse {
  /** Available filter keys. */
  keys: TraceKey[];
}

/** Response from values endpoint. */
export interface TraceValuesResponse {
  /** Available values for the key. */
  values: Array<string | number | boolean>;
}

// ---------------------------------------------------------------------------
// Destination types
// ---------------------------------------------------------------------------

/** OTLP export destination. */
export interface TraceDestination {
  /** Unique slug identifier. */
  slug: string;
  /** Human-readable name. */
  name: string;
  /** Destination type (e.g. "otlp"). */
  type: string;
  /** OTLP endpoint URL. */
  url?: string;
  /** Whether the destination is enabled. */
  enabled: boolean;
  /** Creation timestamp. */
  created_at?: string;
  /** Last modified timestamp. */
  modified_at?: string;
}

/** Input for creating a destination. */
export interface TraceDestinationInput {
  /** Human-readable name. */
  name: string;
  /** Destination type. */
  type: "otlp";
  /** OTLP endpoint URL. */
  url: string;
  /** Optional headers for authentication. */
  headers?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Usage types
// ---------------------------------------------------------------------------

/** Observability usage statistics. */
export interface TraceUsage {
  /** Total event count. */
  eventCount: number;
  /** Time range start. */
  from?: string;
  /** Time range end. */
  to?: string;
  /** Breakdown by worker if available. */
  byWorker?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Live tail types
// ---------------------------------------------------------------------------

/** Live tail session. */
export interface LiveTailSession {
  /** Session ID for heartbeat. */
  sessionId: string;
  /** WebSocket or polling URL. */
  url?: string;
}

/** Live tail event. */
export interface LiveTailEvent {
  /** Event type. */
  type: "trace" | "log" | "error";
  /** Event data. */
  data: TraceEvent;
  /** Timestamp. */
  timestamp: string;
}
