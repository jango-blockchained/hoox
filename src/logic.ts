import { toError } from "@jango-blockchained/hoox-shared/errors";
import { KVKeys } from "@jango-blockchained/hoox-shared/kvKeys";
import { serviceFetch } from "@jango-blockchained/hoox-shared/service-bindings";
import type { Logger } from "@jango-blockchained/hoox-shared/middleware";
import {
  WebhookData,
  TradeData,
  NotificationData,
  ServiceResponse,
} from "./types";
import { IdempotencyStore } from "./idempotencyStore";

// --- Minimal env interfaces for logic functions ---
// Each function declares only the bindings it actually reads.

interface IdempotencyEnv {
  IDEMPOTENCY_STORE?: DurableObjectNamespace;
}

interface TradeEnv extends IdempotencyEnv {
  TRADE_SERVICE?: Fetcher;
  TRADE_QUEUE?: Queue;
  INTERNAL_KEY_BINDING?: string;
}

interface NotificationEnv {
  TELEGRAM_SERVICE?: Fetcher;
  INTERNAL_KEY_BINDING?: string;
}

// --- Queue mode cache (config rarely changes, 60s TTL) ---
let cachedQueueMode:
  | "queue_everywhere"
  | "queue_failover"
  | "queue_disabled"
  | null = null;
let queueModeCacheExpiry = 0;
const QUEUE_MODE_CACHE_TTL_MS = 60_000;

/**
 * Get queue mode from KV config (cached for 60s).
 */
export async function getQueueMode(
  kv: KVNamespace
): Promise<"queue_everywhere" | "queue_failover" | "queue_disabled"> {
  const now = Date.now();
  if (cachedQueueMode && now < queueModeCacheExpiry) {
    return cachedQueueMode;
  }

  const mode = await kv.get(KVKeys.KV_WEBHOOK_QUEUE_MODE);
  const resolved =
    mode === "queue_disabled"
      ? "queue_disabled"
      : mode === "queue_everywhere"
        ? "queue_everywhere"
        : "queue_failover";

  cachedQueueMode = resolved;
  queueModeCacheExpiry = now + QUEUE_MODE_CACHE_TTL_MS;
  return resolved;
}

/**
 * Generate idempotency key for a trade
 */
export function generateIdempotencyKey(tradeData: TradeData): string {
  return `trade:${tradeData.exchange}:${tradeData.symbol}:${tradeData.action}:${tradeData.quantity}`;
}

/**
 * Check and store idempotency key using Durable Object
 */
export async function checkIdempotency(
  env: IdempotencyEnv,
  key: string,
  logger: Logger
): Promise<boolean> {
  if (!env.IDEMPOTENCY_STORE) {
    return true; // No DO configured, allow all
  }

  try {
    const id = env.IDEMPOTENCY_STORE.idFromName(key);
    // DurableObjectStub is an RPC proxy — cast to the DO class interface
    const stub = env.IDEMPOTENCY_STORE.get(id) as unknown as IdempotencyStore;
    return await stub.checkAndStore(key);
  } catch (error) {
    logger.error("[checkIdempotency] Error:", { error: toError(error) });
    return true; // Allow on error to not block trades
  }
}

/**
 * Send trade to queue for async processing
 */
export async function sendTradeToQueue(
  queue: Queue,
  tradeData: TradeData,
  logger: Logger
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

/**
 * Forward to trade worker using Service Binding or Queue
 */
export async function processTrade(
  tradeData: TradeData,
  env: TradeEnv,
  logger: Logger,
  options: {
    checkIdempotency: (
      env: IdempotencyEnv,
      key: string,
      logger: Logger
    ) => Promise<boolean>;
    sendTradeToQueue: (
      queue: Queue,
      data: TradeData,
      logger: Logger
    ) => Promise<void>;
    MAX_TRADES_PER_MINUTE: number;
  },
  queueMode:
    | "queue_everywhere"
    | "queue_failover"
    | "queue_disabled" = "queue_failover"
): Promise<ServiceResponse> {
  const { requestId } = tradeData;
  const { checkIdempotency, sendTradeToQueue } = options;

  // Check idempotency before processing
  const idempotencyKey = generateIdempotencyKey(tradeData);
  const isNew = await checkIdempotency(env, idempotencyKey, logger);
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

  // Check if we should use queue (queue_disabled skips queue entirely)
  const useQueue =
    queueMode !== "queue_disabled" &&
    (queueMode === "queue_everywhere" || !env.TRADE_SERVICE);

  if (useQueue && env.TRADE_QUEUE) {
    try {
      await sendTradeToQueue(env.TRADE_QUEUE, tradeData, logger);
      return {
        success: true,
        requestId,
        tradeResult: { queued: true, message: "Trade queued for execution" },
      };
    } catch (error: unknown) {
      logger.error(`[${requestId}] Failed to queue trade:`, {
        error: toError(error),
      });
    }
  }

  // Direct service call
  if (!env.TRADE_SERVICE) {
    logger.error(`[${requestId}] TRADE_SERVICE binding is not configured.`);
    return {
      success: false,
      requestId,
      error: "TRADE_SERVICE binding is not configured.",
    };
  }

  try {
    const internalKey = env.INTERNAL_KEY_BINDING;
    if (!internalKey) {
      logger.error(`[${requestId}] INTERNAL_KEY_BINDING not configured.`);
      return {
        success: false,
        requestId,
        error: "Internal authentication key not configured.",
      };
    }
    const res = await serviceFetch(env.TRADE_SERVICE, "/webhook", tradeData, {
      headers: {
        "X-Internal-Auth-Key": internalKey,
        "X-Request-ID": requestId,
      },
    });
    const result = await res.json();
    return {
      success: res.ok,
      requestId,
      tradeResult: result,
      error: res.ok ? undefined : "Trade worker returned error",
    };
  } catch (error: unknown) {
    logger.error(`[${requestId}] Error calling TRADE_SERVICE:`, {
      error: toError(error),
    });
    return {
      success: false,
      requestId,
      error: `Error calling trade service: ${toError(error)}`,
    };
  }
}

/**
 * Forward to telegram worker using Service Binding
 */
export async function processNotification(
  notificationData: NotificationData,
  env: NotificationEnv,
  logger: Logger
): Promise<ServiceResponse> {
  const { requestId } = notificationData;

  if (!env.TELEGRAM_SERVICE) {
    logger.error(`[${requestId}] TELEGRAM_SERVICE binding is not configured.`);
    return {
      success: false,
      requestId,
      error: "TELEGRAM_SERVICE binding is not configured.",
    };
  }

  const internalKey = env.INTERNAL_KEY_BINDING;
  if (!internalKey) {
    logger.error(`[${requestId}] INTERNAL_KEY_BINDING is not configured.`);
    return {
      success: false,
      requestId,
      error: "Internal authentication key not configured.",
    };
  }

  try {
    const res = await serviceFetch(
      env.TELEGRAM_SERVICE,
      "/alert",
      notificationData,
      {
        headers: { "X-Internal-Auth-Key": internalKey },
      }
    );
    const result = await res.json();
    return {
      success: res.ok,
      requestId,
      notificationResult: result,
      error: res.ok ? undefined : "Telegram worker returned error",
    };
  } catch (error: unknown) {
    logger.error(`[${requestId}] Error calling TELEGRAM_SERVICE:`, {
      error: toError(error),
    });
    return {
      success: false,
      requestId,
      error: `Error calling telegram service: ${toError(error)}`,
    };
  }
}

/**
 * Create a default notification message from webhook data
 */
export function createDefaultMessage(data: WebhookData): string {
  return `Trade Signal: ${data.action} ${data.symbol} @ ${data.exchange} (Qty: ${data.quantity})`;
}
