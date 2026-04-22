// hoox/src/index.ts - Public-facing gateway for TradingView

import type { Fetcher, KVNamespace, Queue, DurableObjectNamespace } from "@cloudflare/workers-types";
import type { Ai } from "@cloudflare/ai";

import { checkKillSwitch } from "./killSwitch";
import { checkIpAllowlist } from "./ipAllowlist";
import { getOrCreateSession } from "./sessionManager";
import { IdempotencyStore } from "./idempotencyStore";

// --- Constants ---
const MAX_TRADES_PER_MINUTE = 10;
const RATE_LIMIT_WINDOW = 60; // 60 seconds

// --- TradingView Allowed IPs ---
const TRADINGVIEW_ALLOWED_IPS = new Set([
	'52.89.214.238',
	'34.212.75.30',
	'54.218.53.128',
	'52.32.178.7',
]);

// --- Remove invalid imports ---
// import { type Env } from "./types";
// import { type TradeSignal, type WorkerResponse } from "./types";
// ... other unused imports ...

// --- Type Definitions ---

// Define SecretBinding structure
interface SecretBinding {
  get: () => Promise<string | null>;
}

// Define the expected environment variables and bindings from wrangler.toml
interface Env {
  AI: Ai; // Add the AI binding
  // Bindings
  TRADE_SERVICE: Fetcher; // Service binding to trade-worker
  TELEGRAM_SERVICE: Fetcher; // Service binding to telegram-worker
  TRADE_QUEUE: Queue; // Queue binding for trade execution
  IDEMPOTENCY_STORE: DurableObjectNamespace; // Idempotency tracking
  WEBHOOK_API_KEY_BINDING: SecretBinding; // Secret for incoming API key
  INTERNAL_KEY_BINDING: SecretBinding; // Secret for calling other internal services (e.g., legacy Telegram/HA)
  HA_TOKEN_BINDING?: SecretBinding; // Optional: If HA worker communication is needed
  SESSIONS_KV: KVNamespace; // Added for session management
  CONFIG_KV: KVNamespace; // Added for configuration

  // Variables (Consider removing if not used directly or handled by bindings)
  TELEGRAM_WORKER_URL?: string; // Keep ONLY if still needed as fallback or for other purposes
  HA_WORKER_URL?: string;
  ENABLE_DEBUG_ENDPOINTS?: string;

  // Deprecated/Remove:
  // TRADE_WORKER_URL: string;
  // API_SECRET_KEY: string; // Use WEBHOOK_API_KEY_BINDING instead
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

// --- Security Headers ---
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
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
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// --- KV Configuration Keys ---
const KV_IP_CHECK_ENABLED_KEY = "webhook:tradingview:ip_check_enabled";
const KV_ALLOWED_IPS_KEY = "webhook:tradingview:allowed_ips";
const KV_QUEUE_MODE_KEY = "webhook:queue_mode"; // "queue_failover" or "queue_everywhere"

// --- Default Export (Worker Entry Point) ---
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const debugEndpointsEnabled = env.ENABLE_DEBUG_ENDPOINTS === "true";
      
      // --- Global Kill Switch Check ---
      const killSwitch = await checkKillSwitch(env.CONFIG_KV);
      if (killSwitch.enabled) {
        return wrapResponse(
          createSecureResponse(
            { success: false, error: "Trading is temporarily paused (Kill Switch)" },
            { status: 503 }
          )
        );
      }

      // --- IP Allow-listing Check ---
      const clientIp = request.headers.get("CF-Connecting-IP");
      const ipCheck = await checkIpAllowlist(env.CONFIG_KV, clientIp);
      if (!ipCheck.allowed) {
        return wrapResponse(
          createSecureResponse(
            { success: false, error: "Forbidden - Invalid Source IP" },
            { status: 403 }
          )
        );
      }

      // Process request
      const response = await handleRequest(request, env);
      return wrapResponse(response);
    } catch (error: unknown) {
      // Even error responses get security headers
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[fetch] Unhandled error:", errorMsg);
      return wrapResponse(
        new Response(JSON.stringify({ success: false, error: "Internal server error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      );
    }
  },
};

// --- Request Handling Logic ---

async function handleRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    console.log(`[handleRequest] Returning METHOD NOT ALLOWED response (status 405)`);
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const data: WebhookData = await request.json();

    // Validate the API key using the secret binding
    const { apiKey } = data;
    if (!apiKey) {
      console.warn("[handleRequest] apiKey missing from payload");
      return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const isValid = await validateApiKeyBinding(apiKey, env.WEBHOOK_API_KEY_BINDING);
    if (!isValid) {
        console.warn("[handleRequest] Invalid apiKey provided");
        return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
        });
    }

    // Remove the API key from the data before processing/forwarding
    delete data.apiKey;

    // Generate tracking ID
    const requestId = crypto.randomUUID();
    let overallSuccess = true; // Track overall status
    const errorMessages: string[] = [];

    const {
        exchange,
        action,
        symbol,
        quantity,
        price,
        leverage,
        notify,
      } = data;

    // Process trading signal if present
    let tradeResult: ServiceResponse | null = null;
    const queueMode = await getQueueMode(env.CONFIG_KV);
    if (exchange && action && symbol && quantity) {
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
        console.error(
          `Trade processing failed for ${requestId}:`,
          tradeResult?.error
        );
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
        console.error(
          `Notification processing failed for ${requestId}:`,
          notificationResult?.error
        );
      }
    }

    // --- Construct Response ---
    if (overallSuccess) {
      console.log(
        `[handleRequest] Returning SUCCESS response (status 200) for ${requestId}`
      );
      return new Response(
        JSON.stringify({
          success: true,
          requestId,
          tradeResult,
          notificationResult,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } else {
      console.log(
        `[handleRequest] Returning FAILURE response (status 500) for ${requestId} due to: ${errorMessages.join(
          "; "
        )}`
      );
      return new Response(
        JSON.stringify({
          success: false,
          requestId,
          error: `Processing failed: ${errorMessages.join("; ")}`,
          tradeResult, // Include partial results/errors
          notificationResult,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

  } catch (error: unknown) {
    // Type guard for error message
    const errorMsg = error instanceof Error ? error.message : String(error || "Internal Server Error");
    console.error(`[handleRequest] Uncaught error: ${errorMsg}`, error);
    return new Response(JSON.stringify({ success: false, error: errorMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * Secure API key validation using a secret binding.
 */
async function validateApiKeyBinding(apiKey: string, binding?: SecretBinding): Promise<boolean> {
    if (!binding) {
        console.error("[validateApiKeyBinding] WEBHOOK_API_KEY_BINDING is not configured.");
        return false;
    }
    try {
        const expectedKey = await binding.get();
        if (!expectedKey) {
             console.error("[validateApiKeyBinding] Failed to retrieve key from binding.");
            return false;
        }
        // Basic string comparison (consider timing attacks if critical)
        const isValid = apiKey === expectedKey;
        console.log(`[validateApiKeyBinding] Validation result: ${isValid}`);
        return isValid;
    } catch (e: unknown) {
         const errorMsg = e instanceof Error ? e.message : String(e || "Error retrieving secret");
         console.error("[validateApiKeyBinding] Error retrieving secret:", errorMsg);
         return false;
    }
}

/**
 * Get queue mode from KV config.
 * Returns "queue_everywhere" or "queue_failover" (default)
 */
async function getQueueMode(kv: KVNamespace): Promise<"queue_everywhere" | "queue_failover"> {
    const mode = await kv.get(KV_QUEUE_MODE_KEY);
    return (mode === "queue_everywhere") ? "queue_everywhere" : "queue_failover";
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
async function checkIdempotency(
    env: Env,
    key: string
): Promise<boolean> {
    if (!env.IDEMPOTENCY_STORE) {
        return true; // No DO configured, allow all
    }

    try {
        const id = env.IDEMPOTENCY_STORE.newUniqueId();
        const stub = env.IDEMPOTENCY_STORE.get(id);
        return await stub.checkAndStore(key);
    } catch (error) {
        console.error("[checkIdempotency] Error:", error);
        return true; // Allow on error to not block trades
    }
}

/**
 * Simple rate limiting using in-memory map (per-worker, resets on cold start)
 * For production, consider using KV with sliding window
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(sessionId: string): boolean {
    const now = Date.now();
    const key = `rate:${sessionId}`;
    const entry = rateLimitMap.get(key);

    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW * 1000 });
        return true;
    }

    if (entry.count >= MAX_TRADES_PER_MINUTE) {
        return false;
    }

    entry.count++;
    return true;
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
    console.log(`[${tradeData.requestId}] Trade sent to queue`);
}

// Forward to trade worker using Service Binding or Queue
async function processTrade(
  tradeData: TradeData,
  env: Env,
  queueMode: "queue_everywhere" | "queue_failover" = "queue_failover"
): Promise<ServiceResponse> {
  const { requestId, exchange, action, symbol, quantity, price, leverage } = tradeData;
  console.log(`[${requestId}] processTrade: Received trade data:`, tradeData);
  console.log(`[${requestId}] Queue mode: ${queueMode}`);

  // Check idempotency before processing
  const idempotencyKey = generateIdempotencyKey(tradeData);
  const isNew = await checkIdempotency(env, idempotencyKey);
  if (!isNew) {
    console.log(`[${requestId}] Duplicate trade detected, rejecting: ${idempotencyKey}`);
    return {
      success: false,
      requestId,
      error: "Duplicate trade request. This trade was already processed.",
    };
  }

  // Check rate limit (using session ID from request or generated)
  const sessionId = tradeData.requestId; // Use requestId as session key
  if (!checkRateLimit(sessionId)) {
    console.log(`[${requestId}] Rate limit exceeded for session: ${sessionId}`);
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
      const errorMsg = error instanceof Error ? error.message : String(error || "Unknown error");
      console.error(`[${requestId}] Failed to queue trade:`, errorMsg);
      // Fall back to direct service call if queue fails
    }
  }

  // Direct service call (or fallback from queue mode)
  if (!env.TRADE_SERVICE) {
    console.error(`[${requestId}] TRADE_SERVICE binding is not configured.`);
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
        action: action.toUpperCase() as WebhookPayload['action'], 
        symbol: symbol,
        quantity: quantity,
        price: price,
        leverage: leverage,
    };

    // Construct the request for the trade-worker
    // Using relative path "/webhook" assuming service binding handles the base URL
    // --> Use a dummy absolute URL instead of just the path
    const tradeWorkerRequest = new Request("http://trade-service/webhook", { // Dummy URL
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": requestId, // Pass request ID for tracing
        // We assume /webhook doesn't need the internal key, unlike /process
      },
      body: JSON.stringify(tradeWorkerPayload),
    });

    console.log(`[${requestId}] Calling TRADE_SERVICE service binding with payload:`, tradeWorkerPayload);
    // Use the correct binding name: TRADE_SERVICE
    const response = await env.TRADE_SERVICE.fetch(tradeWorkerRequest); 

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[${requestId}] Error calling TRADE_SERVICE: ${response.status} - ${errorText}`
      );
      
      // If in queue_failover mode and direct call failed, try queue as fallback
      if (queueMode === "queue_failover" && env.TRADE_QUEUE) {
        console.log(`[${requestId}] Direct call failed, attempting queue fallback...`);
        try {
          await sendTradeToQueue(env.TRADE_QUEUE, tradeData);
          return {
            success: true,
            requestId,
            tradeResult: { queued: true, fallback: true, message: "Trade queued after direct call failure" },
          };
        } catch (queueError: unknown) {
          console.error(`[${requestId}] Queue fallback also failed:`, queueError);
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
    console.log(`[${requestId}] Response from TRADE_SERVICE:`, result);
    // Adapt response based on trade-worker's actual return structure
    return { 
        success: result.success, 
        requestId, 
        tradeResult: result.result, // Pass nested result
        error: result.error // Pass nested error
    }; 

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error || "Unknown error calling trade service");
    console.error(`[${requestId}] Exception calling TRADE_SERVICE:`, errorMsg, error);
    
    // If in queue_failover mode and exception occurred, try queue as fallback
    if (queueMode === "queue_failover" && env.TRADE_QUEUE) {
      console.log(`[${requestId}] Direct call exception, attempting queue fallback...`);
      try {
        await sendTradeToQueue(env.TRADE_QUEUE, tradeData);
        return {
          success: true,
          requestId,
          tradeResult: { queued: true, fallback: true, message: "Trade queued after exception" },
        };
      } catch (queueError: unknown) {
        console.error(`[${requestId}] Queue fallback also failed:`, queueError);
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
  console.log(`[${requestId}] processNotification: Received notification data:`, notificationData);

  // --- Task 10.5: Implement Inter-Worker Communication --- 
  if (!env.TELEGRAM_SERVICE) {
      console.error(`[${requestId}] TELEGRAM_SERVICE binding is not configured.`);
      return {
        success: false,
        requestId,
        error: "Telegram service binding not available.",
      };
  }
  if (!env.INTERNAL_KEY_BINDING) {
      console.error(`[${requestId}] INTERNAL_KEY_BINDING is not configured for Telegram call auth.`);
      return {
        success: false,
        requestId,
        error: "Internal authentication key not configured.",
      };
  }

  try {
    const internalAuthKey = await env.INTERNAL_KEY_BINDING.get();
    if (!internalAuthKey) {
        console.error(`[${requestId}] Failed to retrieve internal key from binding.`);
        return {
          success: false,
          requestId,
          error: "Failed to retrieve internal authentication key.",
        };
    }

    // Construct the payload expected by telegram-worker's /process endpoint
    const telegramWorkerPayload: ProcessRequestBody = {
        requestId: requestId, // Pass the ID
        internalAuthKey: internalAuthKey,
        payload: {
            message: message,
            chatId: chatId, // Pass chatId (telegram-worker will use default if undefined)
        }
    };

    // Construct the request for the telegram-worker
    // Using relative path "/process" assuming service binding handles the base URL
    // --> Use a dummy absolute URL instead of just the path
    const telegramWorkerRequest = new Request("http://telegram-service/process", { // Dummy URL
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // No need for X-Request-ID header as it's in the body
      },
      body: JSON.stringify(telegramWorkerPayload),
    });

    console.log(`[${requestId}] Calling TELEGRAM_SERVICE service binding with payload...`); // Don't log internal key
    const response = await env.TELEGRAM_SERVICE.fetch(telegramWorkerRequest);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
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
    console.log(`[${requestId}] Response from TELEGRAM_SERVICE:`, result);
    return {
        success: result.success,
        requestId,
        notificationResult: result.result,
        error: result.error
    };

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error || "Unknown error calling telegram service");
    console.error(`[${requestId}] Exception calling TELEGRAM_SERVICE:`, errorMsg, error);
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

/**
 * Temporary handler for testing basic Workers AI LLM calls.
 * Expects a 'prompt' query parameter.
 * REMOVE OR SECURE BEFORE PRODUCTION.
 */
async function handleAiTest(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const prompt = url.searchParams.get("prompt");

    if (!prompt) {
        return new Response(JSON.stringify({ success: false, error: "Missing 'prompt' query parameter" }), {
            status: 400, headers: { "Content-Type": "application/json" }
        });
    }

    if (!env.AI) {
        console.error("AI binding is not configured in the environment.");
        return new Response(JSON.stringify({ success: false, error: "AI service not available." }), {
            status: 500, headers: { "Content-Type": "application/json" }
        });
    }

    try {
        console.log(`Sending prompt to AI: "${prompt}"`);

        // Basic call to the LLM
        const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', { 
            messages: [
                // Adjust system prompt based on hoox's potential AI use case
                { role: 'system', content: 'You are an assistant analyzing incoming data.' }, 
                { role: 'user', content: prompt }
            ]
         });

        console.log("Received AI response.");
        return new Response(JSON.stringify({ success: true, result: response }), {
            status: 200, headers: { "Content-Type": "application/json" }
        });

    } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error || "Unknown AI error");
        console.error(`Error calling AI: ${errorMsg}`, error);
         return new Response(JSON.stringify({ success: false, error: `AI request failed: ${errorMsg}` }), {
            status: 500, headers: { "Content-Type": "application/json" }
        });
    }
}

export { IdempotencyStore };
