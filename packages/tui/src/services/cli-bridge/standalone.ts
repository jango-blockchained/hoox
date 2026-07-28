/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CliBridge — Standalone exported items extracted from cli-bridge.ts
 *
 * Contains:
 *   - validateReadOnlySql + helper constants/functions
 *   - AI_MODEL_OPTIONS
 *   - agentChatStream + helper constants
 */
import type {
  SqlValidationResult,
  AiModelOption,
  ChatMessage,
  AgentChatStreamResult,
} from "./types";

// ─── SQL Validation ───────────────────────────────────────────────────────────

/**
 * SQL keywords that the TUI's `db-query` view is forbidden from sending.
 *
 * Defends against accidental or malicious DML/DDL via the TUI's read-only
 * SQL input. Detection is case-insensitive and word-boundary aware.
 */
const FORBIDDEN_SQL_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "REPLACE",
  "DROP",
  "CREATE",
  "ALTER",
  "TRUNCATE",
  "PRAGMA",
  "ATTACH",
  "DETACH",
  "VACUUM",
  "REINDEX",
] as const;

/**
 * SQL keywords permitted as the first non-whitespace, non-comment token.
 *
 * `SELECT` is the canonical read-only entry point. `WITH` is allowed because
 * CTEs (Common Table Expressions) are read-only when followed by a SELECT.
 * `EXPLAIN` is allowed because it is read-only and is useful for query
 * diagnostics.
 */
const ALLOWED_ENTRY_KEYWORDS = ["SELECT", "WITH", "EXPLAIN"] as const;

/** Strip SQL line comments (`-- ...\n`) and block comments (`/* ... *\/`). */
function stripSqlComments(input: string): string {
  // Block comments: /* ... */ (non-greedy, multi-line)
  const noBlock = input.replace(/\/\*[\s\S]*?\*\//g, " ");
  // Line comments: -- to end-of-line
  const noLine = noBlock.replace(/--[^\n]*/g, " ");
  return noLine;
}

/** Strip single-quoted and double-quoted string literals (rough heuristic). */
function stripSqlStrings(input: string): string {
  // Single-quoted with doubled '' escapes
  const noSingle = input.replace(/'(?:''|[^'])*'/g, "''");
  // Double-quoted identifiers
  const noDouble = noSingle.replace(/"[^"]*"/g, '""');
  return noDouble;
}

/**
 * Validate that a SQL string is a read-only D1 query safe to send through
 * the TUI's `db-query` view.
 *
 * Rules enforced:
 *   1. Must be non-empty after trimming.
 *   2. First non-whitespace, non-comment, non-string token must be one of
 *      {@link ALLOWED_ENTRY_KEYWORDS} (case-insensitive).
 *   3. The statement must not contain any of {@link FORBIDDEN_SQL_KEYWORDS}
 *      as a word (case-insensitive, word-boundary aware).
 *   4. At most one `;` is allowed, and only as the trailing terminator
 *      (i.e. multi-statement payloads like `SELECT 1; DROP TABLE x` are
 *      rejected).
 *
 * The function never throws. Returns a structured result the view can
 * render directly.
 */
export function validateReadOnlySql(sql: string): SqlValidationResult {
  if (typeof sql !== "string" || sql.trim().length === 0) {
    return { readonly: false, reason: "SQL is empty" };
  }

  const stripped = stripSqlStrings(stripSqlComments(sql)).trim();
  if (stripped.length === 0) {
    return { readonly: false, reason: "SQL is empty (only comments?)" };
  }

  // First significant token: take the first whitespace-delimited word.
  const firstTokenMatch = stripped.match(/^[\s(]*([A-Za-z_]+)/);
  const firstToken = firstTokenMatch?.[1]?.toUpperCase() ?? "";
  if (
    !ALLOWED_ENTRY_KEYWORDS.includes(
      firstToken as (typeof ALLOWED_ENTRY_KEYWORDS)[number]
    )
  ) {
    return {
      readonly: false,
      reason: `Only SELECT, WITH, or EXPLAIN queries are allowed (got "${firstToken || "(nothing)"}")`,
    };
  }

  // Reject any forbidden keyword as a whole word (case-insensitive).
  for (const keyword of FORBIDDEN_SQL_KEYWORDS) {
    const pattern = new RegExp(`\\b${keyword}\\b`, "i");
    if (pattern.test(stripped)) {
      return {
        readonly: false,
        reason: `Forbidden keyword: ${keyword}. Read-only queries only.`,
      };
    }
  }

  // Reject multiple statements. Allow at most one trailing `;`.
  const semicolons = (stripped.match(/;/g) ?? []).length;
  if (semicolons > 1) {
    return {
      readonly: false,
      reason: "Multiple statements are not allowed. Use a single query.",
    };
  }
  if (semicolons === 1) {
    const lastSemi = stripped.lastIndexOf(";");
    if (lastSemi !== stripped.length - 1) {
      // Allow 1 trailing whitespace after the semicolon, but nothing else.
      const trailing = stripped.slice(lastSemi + 1).trim();
      if (trailing.length > 0) {
        return {
          readonly: false,
          reason: "Semicolons are only allowed at the end of the query.",
        };
      }
    }
  }

  return { readonly: true };
}

// ─── AI Model Options ─────────────────────────────────────────────────────────

/** Default AI model options offered in the chat UI. */
export const AI_MODEL_OPTIONS: AiModelOption[] = [
  { id: "workers-ai", label: "Workers AI (Llama 3.1)", provider: "cloudflare" },
  {
    id: "openai:gpt-4o-mini",
    label: "OpenAI (GPT-4o-mini)",
    provider: "openai",
  },
  {
    id: "anthropic:claude-3-5-haiku",
    label: "Anthropic (Claude 3.5 Haiku)",
    provider: "anthropic",
  },
];

// ─── AI Chat SSE Streaming ────────────────────────────────────────────────────

/** Reconnection backoff for SSE streaming. */
const SSE_RECONNECT_BASE_MS = 1_000;
const SSE_RECONNECT_MAX_MS = 16_000;
const SSE_MAX_RECONNECT_ATTEMPTS = 5;

/**
 * Start an SSE stream to the AI chat endpoint.
 *
 * @param params          Chat parameters (messages, model, temperature, etc.)
 * @param apiBase         Base URL for the API (default: http://localhost:8787)
 * @param apiToken        Bearer token for auth (default: HOOX_API_TOKEN env var)
 * @param onToken         Called with each streamed token string fragment
 * @param onStatus        Optional callback for connection status updates
 * @returns               An AgentChatStreamResult with abort + finished
 */
export function agentChatStream(
  params: {
    messages: ChatMessage[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
  },
  apiBase: string = "http://localhost:8787",
  apiToken: string = process.env.HOOX_API_TOKEN ?? "",
  onToken?: (token: string) => void,
  onStatus?: (status: "connected" | "reconnecting" | "disconnected") => void
): AgentChatStreamResult {
  const abortController = new AbortController();
  let completed = false;

  const finished = (async () => {
    let attempt = 0;

    while (
      !abortController.signal.aborted &&
      attempt < SSE_MAX_RECONNECT_ATTEMPTS
    ) {
      try {
        const url = `${apiBase.replace(/\/$/, "")}/api/agent/chat`;
        const body = JSON.stringify({
          messages: params.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          model:
            params.model && params.model !== "workers-ai"
              ? params.model
              : undefined,
          temperature: params.temperature ?? 0.7,
          maxTokens: params.maxTokens ?? 500,
          stream: true,
        });

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
          },
          body,
          signal: abortController.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`Chat stream failed: HTTP ${response.status}`);
        }

        attempt = 0;
        onStatus?.("connected");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!abortController.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data: ")) {
              const data = trimmed.slice(6);
              if (data === "[DONE]") {
                completed = true;
                break;
              }
              try {
                const parsed = JSON.parse(data) as { content?: string };
                if (parsed.content) {
                  onToken?.(parsed.content);
                }
              } catch {
                // Skip malformed events during streaming
              }
            }
          }
        }

        if (completed || abortController.signal.aborted) {
          break;
        }
      } catch {
        if (abortController.signal.aborted || completed) break;

        onStatus?.("reconnecting");
        attempt++;

        if (attempt < SSE_MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(
            SSE_RECONNECT_BASE_MS * Math.pow(2, attempt - 1),
            SSE_RECONNECT_MAX_MS
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    if (!abortController.signal.aborted && !completed) {
      onStatus?.("disconnected");
    }
  })();

  return {
    abort: abortController,
    finished,
  };
}
