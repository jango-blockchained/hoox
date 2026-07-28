/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Hoox self-hosted production server.
 *
 * Routes incoming HTTP requests to the bundled worker modules in `./dist/`
 * based on path prefix. Each worker module exports a `default` object with a
 * `fetch(request, env, ctx)` method that mirrors Cloudflare Workers'
 * `ExportedHandler` semantics.
 *
 * Path prefix map (must mirror the architecture in DESIGN.md):
 *   /          → hoox (public gateway; TradingView webhook entry)
 *   /trade     → trade-worker
 *   /telegram  → telegram-worker
 *   /d1        → d1-worker
 *   /wallet    → web3-wallet-worker
 *   /agent     → agent-worker
 *   /email     → email-worker
 *   /report    → report-worker
 *   /analytics → analytics-worker
 *
 * Auth:
 *   When HOOX_SERVER_API_KEY is set, every non-/healthz request must include
 *   a matching `X-API-Key` header (or `?api_key=` query param). When unset,
 *   the server runs in unauthenticated dev mode (with a console warning).
 *
 * Production safety (M-12):
 *   If NODE_ENV === "production" and HOOX_SERVER_API_KEY is missing/undefined,
 *   the process exits 1 immediately at startup. A console.warn is not a
 *   security control.
 *
 * Known limitations (see subtask 07 / DESIGN.md → Self-Hosted Limitations):
 *   - Workers calling `env.SOMETHING_SERVICE.fetch(...)` (Cloudflare service
 *     bindings) will fail in self-hosted mode because the env object does
 *     not provide a real binding. Use the hoox (Cloudflare) deployment for
 *     full service-binding semantics.
 *   - Durable Object bindings (e.g. IDEMPOTENCY_STORE) are not available.
 *     Subtask 07 chose option (a): the polyfill throws at instantiation.
 */

import hoox from "./dist/hoox/index.js";
import tradeWorker from "./dist/trade-worker/index.js";
import telegramWorker from "./dist/telegram-worker/index.js";
import d1Worker from "./dist/d1-worker/index.js";
import web3WalletWorker from "./dist/web3-wallet-worker/index.js";
import agentWorker from "./dist/agent-worker/index.js";
import emailWorker from "./dist/email-worker/index.js";
import reportWorker from "./dist/report-worker/index.js";
import analyticsWorker from "./dist/analytics-worker/index.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT ?? "8080", 10);
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const API_KEY = process.env.HOOX_SERVER_API_KEY;

// M-12: Hard require API key in production. A console.warn is not a
// security control — exit immediately.
if (IS_PRODUCTION && !API_KEY) {
  console.error(
    "FATAL: HOOX_SERVER_API_KEY is required when NODE_ENV=production."
  );
  console.error(
    "Set HOOX_SERVER_API_KEY to a strong secret in your environment."
  );
  console.error(
    "See DESIGN.md → Self-Hosted Limitations for the full list of caveats."
  );
  process.exit(1);
}

if (!API_KEY) {
  console.warn(
    "\u26a0\ufe0f  HOOX_SERVER_API_KEY not set — running in unauthenticated dev mode."
  );
  console.warn(
    "    Set HOOX_SERVER_API_KEY and NODE_ENV=production to enable auth."
  );
}

// ---------------------------------------------------------------------------
// Worker route table — order matters: first prefix match wins.
// ---------------------------------------------------------------------------

const ROUTES = [
  { prefix: "/", worker: hoox }, // gateway catch-all (must stay last for /)
  { prefix: "/trade", worker: tradeWorker },
  { prefix: "/telegram", worker: telegramWorker },
  { prefix: "/d1", worker: d1Worker },
  { prefix: "/wallet", worker: web3WalletWorker },
  { prefix: "/agent", worker: agentWorker },
  { prefix: "/email", worker: emailWorker },
  { prefix: "/report", worker: reportWorker },
  { prefix: "/analytics", worker: analyticsWorker },
];

// ---------------------------------------------------------------------------
// Minimal env object — populated from process.env, with placeholder service
// bindings. Workers calling env.SOMETHING_SERVICE.fetch() will fail in
// self-hosted mode; that is the explicit design choice from subtask 07
// (option a — fail loudly).
// ---------------------------------------------------------------------------

const env = {
  ...process.env,
  // Placeholders for service bindings. Workers that need them will throw
  // a clear error when they call .fetch() on these.
  HOOK_SERVICE: { fetch: notImplemented("HOOK_SERVICE") },
  TRADE_SERVICE: { fetch: notImplemented("TRADE_SERVICE") },
  TELEGRAM_SERVICE: { fetch: notImplemented("TELEGRAM_SERVICE") },
  D1_SERVICE: { fetch: notImplemented("D1_SERVICE") },
  AGENT_SERVICE: { fetch: notImplemented("AGENT_SERVICE") },
  WEB3_WALLET_SERVICE: { fetch: notImplemented("WEB3_WALLET_SERVICE") },
  EMAIL_SERVICE: { fetch: notImplemented("EMAIL_SERVICE") },
  REPORT_SERVICE: { fetch: notImplemented("REPORT_SERVICE") },
  ANALYTICS_SERVICE: { fetch: notImplemented("ANALYTICS_SERVICE") },
  // Durable Object namespaces — option (a): throw at instantiation.
  IDEMPOTENCY_STORE: notImplementedDO("IDEMPOTENCY_STORE"),
};

function notImplemented(name) {
  return () => {
    throw new Error(
      `Service binding ${name} is not available in self-hosted mode. ` +
        "Use the Cloudflare hoox deployment for full service-binding semantics. " +
        "See DESIGN.md → Self-Hosted Limitations."
    );
  };
}

function notImplementedDO(name) {
  return {
    idFromName: () => {
      throw new Error(
        `Durable Object binding ${name} is not available in self-hosted mode. ` +
          "See subtask 07 (option a) and DESIGN.md → Self-Hosted Limitations."
      );
    },
    get: () => {
      throw new Error(
        `Durable Object binding ${name} is not available in self-hosted mode.`
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Security headers — applied to every response.
// ---------------------------------------------------------------------------

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

function applySecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ---------------------------------------------------------------------------
// API key check
// ---------------------------------------------------------------------------

function checkApiKey(request) {
  if (!API_KEY) return true; // unauthenticated dev mode
  const headerKey = request.headers.get("x-api-key");
  if (headerKey === API_KEY) return true;
  try {
    const url = new URL(request.url);
    const queryKey = url.searchParams.get("api_key");
    if (queryKey === API_KEY) return true;
  } catch {
    // malformed URL — fall through
  }
  return false;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

function findWorker(pathname) {
  // Special case: /healthz is handled directly, not by a worker.
  if (pathname === "/healthz") return null;
  for (const route of ROUTES) {
    if (route.prefix === "/") continue; // handled below as catch-all
    if (pathname === route.prefix || pathname.startsWith(`${route.prefix}/`)) {
      return route.worker;
    }
  }
  // Default: gateway (hoox) handles everything else.
  return ROUTES[0].worker;
}

const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
};

const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(request) {
    const url = new URL(request.url);

    // Health check — no auth required (used by orchestrators / HEALTHCHECK).
    if (url.pathname === "/healthz") {
      return new Response("OK", { status: 200, headers: SECURITY_HEADERS });
    }

    // Auth
    if (!checkApiKey(request)) {
      return new Response("Unauthorized", {
        status: 401,
        headers: SECURITY_HEADERS,
      });
    }

    // Dispatch
    const worker = findWorker(url.pathname);
    if (!worker) {
      return new Response("Not Found", {
        status: 404,
        headers: SECURITY_HEADERS,
      });
    }

    try {
      const response = await worker.fetch(request, env, ctx);
      return applySecurityHeaders(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[server.js] worker error on ${url.pathname}: ${message}`);
      return new Response("Internal Server Error", {
        status: 500,
        headers: SECURITY_HEADERS,
      });
    }
  },
  error(err) {
    console.error(`[server.js] Bun.serve error: ${err.message}`);
    return new Response("Internal Server Error", {
      status: 500,
      headers: SECURITY_HEADERS,
    });
  },
});

console.log(
  `[server.js] Hoox self-hosted server listening on :${server.port} ` +
    `(NODE_ENV=${process.env.NODE_ENV ?? "unset"}, ` +
    `auth=${API_KEY ? "enabled" : "DISABLED"})`
);
