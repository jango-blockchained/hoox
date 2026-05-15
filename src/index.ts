// hoox/src/index.ts - Public-facing gateway for TradingView

import type {
  Fetcher,
  KVNamespace,
  Queue,
  DurableObjectNamespace,
} from "@cloudflare/workers-types";
import type { Ai } from "@cloudflare/ai";

import { checkKillSwitch } from "./killSwitch";
import { checkIpAllowlist } from "./ipAllowlist";
import { getOrCreateSession } from "./sessionManager";
import { IdempotencyStore } from "./idempotencyStore";
import { checkRateLimit as kvRateLimit } from "./rateLimiter";
import {
  Errors,
  toError,
  createJsonResponse,
} from "@jango-blockchained/hoox-shared/errors";
import {
  createLogger,
  withRequestLog,
  validateJson,
  requireInternalAuth,
} from "@jango-blockchained/hoox-shared/middleware";
import { createRouter } from "@jango-blockchained/hoox-shared/router";
import {
  WebhookPayloadSchema,
  type WebhookPayload,
  type StandardResponse,
  type ProcessRequestBody,
} from "@jango-blockchained/hoox-shared/types";
import { trackAnalytics } from "@jango-blockchained/hoox-shared/analytics";
import { healthCheck } from "@jango-blockchained/hoox-shared/health";
import { KVKeys } from "@jango-blockchained/hoox-shared/kvKeys";
import { serviceFetch } from "@jango-blockchained/hoox-shared/service-bindings";
import {
  DISCLAIMER,
  DISCLAIMER_HEADER,
} from "@jango-blockchained/hoox-shared/legal";

// --- Rate limiting limits (passed to KV-backed rate limiter) ---
const MAX_TRADES_PER_MINUTE = 10;
const RATE_LIMIT_WINDOW = 60; // 60 seconds

// --- TradingView Allowed IPs ---
const TRADINGVIEW_ALLOWED_IPS = new Set([
  "52.89.214.238",
  "34.212.75.30",
  "54.218.53.128",
  "52.32.178.7",
]);

// --- Remove invalid imports ---
// import { type Env } from "./types";
// import { type TradeSignal, type WorkerResponse } from "./types";
// ... other unused imports ...

// --- Type Definitions ---

interface Env extends Cloudflare.Env, AnalyticsEnv {
  ENABLE_DEBUG_ENDPOINTS?: string;
  TELEGRAM_WORKER_URL?: string;
}

// --- Other interfaces (WebhookData, TradeData, etc.) remain the same ---
// ... existing interfaces ...
interface WebhookData {
  apiKey?: string;
  signal?: string;
  exchange: string;
  action: string;
  symbol: string;
  quantity: number;
  price?: number;
  leverage?: number;
  notify?: {
    message?: string;
    chatId: string;
  };
}

interface TradeData {
  requestId: string;
  exchange: string;
  action: string;
  symbol: string;
  quantity: number;
  price?: number;
  leverage?: number;
}

interface NotificationData {
  requestId: string;
  message: string;
  chatId: string;
}

interface ServiceResponse {
  success: boolean;
  requestId?: string;
  tradeResult?: unknown;
  notificationResult?: unknown;
  error?: string;
}

type HooxProcessRequestBody = ProcessRequestBody<{
  message?: string;
  chatId?: string;
}>;

// --- Security Headers ---
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
};

function createSecureResponse(
  body: string | object,
  options: ResponseInit = {}
): Response {
  const headers: Record<string, string> = { ...SECURITY_HEADERS };

  // Merge with provided headers
  if (options.headers) {
    const providedHeaders =
      typeof options.headers === "object" && !Array.isArray(options.headers)
        ? options.headers
        : {};

    // Handle Headers object or Record
    for (const [key, value] of Object.entries(providedHeaders)) {
      if (value) headers[key] = value;
    }
  }

  // Always attach disclaimer header
  headers[DISCLAIMER_HEADER] = DISCLAIMER;

  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

// Alias for convenience
const secureResponse = createSecureResponse;

// --- Response Wrapper for Security Headers ---
function wrapResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  headers.set(DISCLAIMER_HEADER, DISCLAIMER);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// --- KV Configuration Keys ---
const KV_IP_CHECK_ENABLED_KEY = KVKeys.KV_WEBHOOK_IP_CHECK_ENABLED;
const KV_ALLOWED_IPS_KEY = KVKeys.KV_WEBHOOK_ALLOWED_IPS;

// --- Default Export (Worker Entry Point) ---

const logger = createLogger({ service: "hoox-gateway", module: "router" });

const router = createRouter<Env>();

// Define routes
router.post(
  "/webhook",
  async (request: Request, env: Env, ctx: ExecutionContext) => {
    return await handleRequest(request, env, ctx);
  }
);

router.get(
  "/health",
  async (request: Request, env: Env, ctx: ExecutionContext) => {
    const response = healthCheck({ worker: "hoox" });
    return wrapResponse(response);
  }
);

export default {
  fetch: withRequestLog(
    (request: Request, env: Env, ctx: ExecutionContext) => {
      return router.handle(request, env, ctx);
    },
    { service: "hoox-gateway", module: "router" }
  ),
};

// --- Request Handling Logic ---

async function handleRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const startTime = Date.now();

  if (request.method !== "POST") {
    logger.info(
      `[handleRequest] Returning METHOD NOT ALLOWED response (status 405)`
    );
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const data: WebhookData = await request.json();

    // Validate the API key using the secret binding
    const { apiKey } = data;
    if (!apiKey) {
      logger.warn("[handleRequest] apiKey missing from payload");
      return createJsonResponse({ success: false, error: "Forbidden" }, 403);
    }

    const isValid = await validateApiKeyBinding(
      apiKey,
      env.WEBHOOK_API_KEY_BINDING
    );
    if (!isValid) {
      logger.warn("[handleRequest] Invalid apiKey provided");
      return createJsonResponse({ success: false, error: "Forbidden" }, 403);
    }

    // Remove the API key from the data before processing/forwarding
    delete data.apiKey;

    // Generate tracking ID
    const requestId = crypto.randomUUID();
    let overallSuccess = true; // Track overall status
    const errorMessages: string[] = [];

    const { exchange, action, symbol, quantity, price, leverage, notify } =
      data;

    // Process trading signal if present
    let tradeResult: ServiceResponse | null = null;
    const queueMode = await getQueueMode(env.CONFIG_KV);
    if (exchange && action && symbol && quantity) {
      // Validate trade payload with Zod schema
      const tradePayload = {
        exchange,
        action,
        symbol,
        quantity,
        price,
        leverage,
      };
      const validation = validateJson(WebhookPayloadSchema, tradePayload);
      if (!validation.ok) {
        return createJsonResponse(
          {
            success: false,
            error: `Invalid trade payload: ${validation.error}`,
          },
          400
        );
      }
      tradeResult = await processTrade(
        {
          requestId,
          exchange,
          action,
          symbol,
          quantity,
          price,
          leverage,
        },
        env,
        queueMode
      );
      if (!tradeResult?.success) {
        overallSuccess = false;
        errorMessages.push(tradeResult?.error || "Trade processing failed");
        logger.error(`Trade processing failed for ${requestId}`, {
          error: tradeResult?.error,
        });
      }
    }

    // Process notification if requested
    let notificationResult: ServiceResponse | null = null;
    if (notify) {
      notificationResult = await processNotification(
        {
          requestId,
          message: notify.message || createDefaultMessage(data),
          chatId: notify.chatId,
        },
        env
      );
      if (!notificationResult?.success) {
        overallSuccess = false;
        errorMessages.push(
          notificationResult?.error || "Notification processing failed"
        );
        logger.error(`Notification processing failed for ${requestId}`, {
          error: notificationResult?.error,
        });
      }
    }

    // Track webhook API call (non-blocking)
    const latencyMs = Date.now() - startTime;
    ctx.waitUntil(
      trackAnalytics(env, "/track/api-call", {
        worker: "hoox",
        endpoint: "/webhook",
        latencyMs,
        success: overallSuccess,
      })
    );

    // --- Construct Response ---
    if (overallSuccess) {
      logger.info(
        `[handleRequest] Returning SUCCESS response (status 200) for ${requestId}`
      );
      return createJsonResponse(
        {
          success: true,
          requestId,
          tradeResult,
          notificationResult,
        },
        200
      );
    } else {
      logger.info(
        `[handleRequest] Returning FAILURE response (status 500) for ${requestId} due to: ${errorMessages.join(
          "; "
        )}`
      );
      return createJsonResponse(
        {
          success: false,
          requestId,
          error: `Processing failed: ${errorMessages.join("; ")}`,
          tradeResult, // Include partial results/errors
          notificationResult,
        },
        500
      );
    }
  } catch (error: unknown) {
    const errorMsg = toError(error, "Internal Server Error");
    logger.error(`[handleRequest] Uncaught error: ${errorMsg}`, {
      error: toError(error),
    });
    return Errors.internal(errorMsg);
  }
}

/**
 * Secure API key validation using a secret binding.
 */
async function validateApiKeyBinding(
  apiKey: string,
  binding?: string
): Promise<boolean> {
  if (!binding) {
    logger.error(
      "[validateApiKeyBinding] WEBHOOK_API_KEY_BINDING is not configured."
    );
    return false;
  }
  try {
    const expectedKey = binding;
    if (!expectedKey) {
      logger.error(
        "[validateApiKeyBinding] Failed to retrieve key from binding."
      );
      return false;
    }
    // Basic string comparison (consider timing attacks if critical)
    const isValid = apiKey === expectedKey;
    logger.info(`[validateApiKeyBinding] Validation result: ${isValid}`);
    return isValid;
  } catch (e: unknown) {
    const errorMsg = toError(e, "Error retrieving secret");
    logger.error("[validateApiKeyBinding] Error retrieving secret:", {
      error: errorMsg,
    });
    return false;
  }
}

/**
 * Get queue mode from KV config.
 * Returns "queue_everywhere" or "queue_failover" (default)
 */
async function getQueueMode(
  kv: KVNamespace
): Promise<"queue_everywhere" | "queue_failover"> {
  const mode = await kv.get(KVKeys.KV_WEBHOOK_QUEUE_MODE);
  return mode === "queue_everywhere" ? "queue_everywhere" : "queue_failover";
}

/**
 * Generate idempotency key for a trade
 */
function generateIdempotencyKey(tradeData: TradeData): string {
  return `trade:${tradeData.exchange}:${tradeData.symbol}:${tradeData.action}:${tradeData.quantity}`;
}

/**
 * Check and store idempotency key using Durable Object
 */
async function checkIdempotency(env: Env, key: string): Promise<boolean> {
  if (!env.IDEMPOTENCY_STORE) {
    return true; // No DO configured, allow all
  }

  try {
    const id = env.IDEMPOTENCY_STORE.newUniqueId();
    const stub = env.IDEMPOTENCY_STORE.get(id) as unknown as IdempotencyStore;
    return await stub.checkAndStore(key);
  } catch (error) {
    logger.error("[checkIdempotency] Error:", { error: toError(error) });
    return true; // Allow on error to not block trades
  }
}

/**
 * Rate limiting delegation — uses KV-backed rate limiter when available,
 * falls back to in-memory (per-isolation, resets on cold start).
 */
async function checkRateLimit(sessionId: string, env: Env): Promise<boolean> {
  return kvRateLimit(env.CONFIG_KV ?? null, `session:${sessionId}`, {
    maxRequests: MAX_TRADES_PER_MINUTE,
    windowSeconds: RATE_LIMIT_WINDOW,
  });
}

/**
 * Send trade to queue for async processing
 */
async function sendTradeToQueue(
  queue: Queue,
  tradeData: TradeData
): Promise<void> {
  const message = {
    requestId: tradeData.requestId,
    exchange: tradeData.exchange,
    action: tradeData.action,
    symbol: tradeData.symbol,
    quantity: tradeData.quantity,
    price: tradeData.price,
    leverage: tradeData.leverage,
    queuedAt: new Date().toISOString(),
  };
  await queue.send(message);
  logger.info(`[${tradeData.requestId}] Trade sent to queue`);
}

// Forward to trade worker using Service Binding or Queue
async function processTrade(
  tradeData: TradeData,
  env: Env,
  queueMode: "queue_everywhere" | "queue_failover" = "queue_failover"
): Promise<ServiceResponse> {
  const { requestId, exchange, action, symbol, quantity, price, leverage } =
    tradeData;
  logger.info(`[${requestId}] processTrade: Received trade data`, {
    tradeData,
  });
  logger.info(`[${requestId}] Queue mode: ${queueMode}`);

  // Check idempotency before processing
  const idempotencyKey = generateIdempotencyKey(tradeData);
  const isNew = await checkIdempotency(env, idempotencyKey);
  if (!isNew) {
    logger.info(
      `[${requestId}] Duplicate trade detected, rejecting: ${idempotencyKey}`
    );
    return {
      success: false,
      requestId,
      error: "Duplicate trade request. This trade was already processed.",
    };
  }

  // Check rate limit (using session ID from request or generated)
  const sessionId = tradeData.requestId; // Use requestId as session key
  if (!(await checkRateLimit(sessionId, env))) {
    logger.info(`[${requestId}] Rate limit exceeded for session: ${sessionId}`);
    return {
      success: false,
      requestId,
      error: `Rate limit exceeded. Maximum ${MAX_TRADES_PER_MINUTE} trades per minute.`,
    };
  }

  // Check if we should use queue
  const useQueue = queueMode === "queue_everywhere" || !env.TRADE_SERVICE;

  if (useQueue && env.TRADE_QUEUE) {
    // Use queue mode - send to queue and return success immediately
    try {
      await sendTradeToQueue(env.TRADE_QUEUE, tradeData);
      return {
        success: true,
        requestId,
        tradeResult: { queued: true, message: "Trade queued for execution" },
      };
    } catch (error: unknown) {
      const errorMsg = toError(error, "Unknown error");
      logger.error(`[${requestId}] Failed to queue trade:`, {
        error: errorMsg,
      });
      // Fall back to direct service call if queue fails
    }
  }

  // Direct service call (or fallback from queue mode)
  if (!env.TRADE_SERVICE) {
    logger.error(`[${requestId}] TRADE_SERVICE binding is not configured.`);
    return {
      success: false,
      requestId,
      error: "Trade service binding not available.",
    };
  }

  try {
    // Construct the payload expected by trade-worker's /webhook endpoint
    const tradeWorkerPayload: WebhookPayload = {
      exchange: exchange,
      // Ensure action matches the expected enum in trade-worker (LONG, SHORT, etc.)
      action: action.toUpperCase() as WebhookPayload["action"],
      symbol: symbol,
      quantity: quantity,
      price: price,
      leverage: leverage,
    };

    const internalAuthKey = env.INTERNAL_KEY_BINDING;

    logger.info(
      `[${requestId}] Calling TRADE_SERVICE service binding with payload`,
      { payload: tradeWorkerPayload }
    );
    const response = await serviceFetch(
      env.TRADE_SERVICE,
      "/webhook",
      tradeWorkerPayload,
      {
        headers: {
          "X-Request-ID": requestId,
          ...(internalAuthKey
            ? { "X-Internal-Auth-Key": internalAuthKey as string }
            : {}),
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        `[${requestId}] Error calling TRADE_SERVICE: ${response.status} - ${errorText}`
      );

      // If in queue_failover mode and direct call failed, try queue as fallback
      if (queueMode === "queue_failover" && env.TRADE_QUEUE) {
        logger.info(
          `[${requestId}] Direct call failed, attempting queue fallback...`
        );
        try {
          await sendTradeToQueue(env.TRADE_QUEUE, tradeData);
          return {
            success: true,
            requestId,
            tradeResult: {
              queued: true,
              fallback: true,
              message: "Trade queued after direct call failure",
            },
          };
        } catch (queueError: unknown) {
          logger.error(`[${requestId}] Queue fallback also failed:`, {
            error: toError(queueError),
          });
        }
      }

      return {
        success: false,
        requestId,
        error: `Trade service call failed: ${response.status} - ${errorText}`,
      };
    }

    // Assuming trade-worker returns a StandardResponse { success: boolean, result?, error? }
    const result: StandardResponse = await response.json();
    logger.info(`[${requestId}] Response from TRADE_SERVICE`, { result });
    // Adapt response based on trade-worker's actual return structure
    return {
      success: result.success,
      requestId,
      tradeResult: result.result,
      error: result.error ?? undefined,
    };
  } catch (error: unknown) {
    const errorMsg = toError(error, "Unknown error calling trade service");
    logger.error(
      `[${requestId}] Exception calling TRADE_SERVICE: ${errorMsg}`,
      { error: toError(error) }
    );

    // If in queue_failover mode and exception occurred, try queue as fallback
    if (queueMode === "queue_failover" && env.TRADE_QUEUE) {
      logger.info(
        `[${requestId}] Direct call exception, attempting queue fallback...`
      );
      try {
        await sendTradeToQueue(env.TRADE_QUEUE, tradeData);
        return {
          success: true,
          requestId,
          tradeResult: {
            queued: true,
            fallback: true,
            message: "Trade queued after exception",
          },
        };
      } catch (queueError: unknown) {
        logger.error(`[${requestId}] Queue fallback also failed:`, {
          error: toError(queueError),
        });
      }
    }

    return {
      success: false,
      requestId,
      error: `Exception during trade service call: ${errorMsg}`,
    };
  }
}

// Forward to notification worker using Service Binding
async function processNotification(
  notificationData: NotificationData,
  env: Env
): Promise<ServiceResponse> {
  const { requestId, message, chatId } = notificationData;
  logger.info(
    `[${requestId}] processNotification: Received notification data`,
    { notificationData }
  );

  // --- Task 10.5: Implement Inter-Worker Communication ---
  if (!env.TELEGRAM_SERVICE) {
    logger.error(`[${requestId}] TELEGRAM_SERVICE binding is not configured.`);
    return {
      success: false,
      requestId,
      error: "Telegram service binding not available.",
    };
  }
  if (!env.INTERNAL_KEY_BINDING) {
    logger.error(
      `[${requestId}] INTERNAL_KEY_BINDING is not configured for Telegram call auth.`
    );
    return {
      success: false,
      requestId,
      error: "Internal authentication key not configured.",
    };
  }

  try {
    const internalAuthKey = env.INTERNAL_KEY_BINDING;
    if (!internalAuthKey) {
      logger.error(
        `[${requestId}] Failed to retrieve internal key from binding.`
      );
      return {
        success: false,
        requestId,
        error: "Failed to retrieve internal authentication key.",
      };
    }

    // Construct the payload expected by telegram-worker's /process endpoint
    const payload = {
      requestId: requestId,
      payload: {
        message: message,
        chatId: chatId,
      },
    };

    logger.info(`[${requestId}] Calling TELEGRAM_SERVICE service binding...`);
    const response = await serviceFetch(
      env.TELEGRAM_SERVICE,
      "/process",
      payload,
      {
        headers: { "X-Internal-Auth-Key": internalAuthKey as string },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        `[${requestId}] Error calling TELEGRAM_SERVICE: ${response.status} - ${errorText}`
      );
      return {
        success: false,
        requestId,
        error: `Telegram service call failed: ${response.status} - ${errorText}`,
      };
    }

    // Assuming telegram-worker returns a StandardResponse { success: boolean, result?, error? }
    const result: StandardResponse = await response.json();
    logger.info(`[${requestId}] Response from TELEGRAM_SERVICE`, { result });
    return {
      success: result.success,
      requestId,
      notificationResult: result.result,
      error: result.error ?? undefined,
    };
  } catch (error: unknown) {
    const errorMsg = toError(error, "Unknown error calling telegram service");
    logger.error(
      `[${requestId}] Exception calling TELEGRAM_SERVICE: ${errorMsg}`,
      { error: toError(error) }
    );
    return {
      success: false,
      requestId,
      error: `Exception during telegram service call: ${errorMsg}`,
    };
  }
  // --- End Task 10.5 ---
}

// Create default message from trade data
function createDefaultMessage(data: WebhookData): string {
  const { exchange, action, symbol, quantity, price } = data;
  let message = `📊 Trade Alert: ${action} ${symbol}\n`;
  message += `📈 Exchange: ${exchange}\n`;
  message += `💰 Quantity: ${quantity}\n`;

  if (price !== undefined) {
    message += `💵 Price: ${price}\n`;
  }

  return message;
}

export { IdempotencyStore };
