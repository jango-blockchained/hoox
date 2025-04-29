// webhook-receiver/src/index.ts - Public-facing endpoint for TradingView

// Import Fetcher type for service bindings
import type { Fetcher } from "@cloudflare/workers-types";

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
  // Bindings
  TRADE_SERVICE: Fetcher; // Service binding to trade-worker
  TELEGRAM_SERVICE: Fetcher; // Service binding to telegram-worker
  WEBHOOK_API_KEY_BINDING: SecretBinding; // Secret for incoming API key
  INTERNAL_KEY_BINDING: SecretBinding; // Secret for calling other internal services (e.g., legacy Telegram/HA)
  HA_TOKEN_BINDING?: SecretBinding; // Optional: If HA worker communication is needed

  // Variables (Consider removing if not used directly or handled by bindings)
  TELEGRAM_WORKER_URL?: string; // Keep ONLY if still needed as fallback or for other purposes
  HA_WORKER_URL?: string;

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

// Removed Hono router usage as it wasn't fully implemented
// If needed, re-introduce with proper Hono setup: `const app = new Hono<{ Bindings: Env }>()`

// --- Default Export (Worker Entry Point) ---
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return await handleRequest(request, env);
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
        env
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

// Forward to trade worker using Service Binding
async function processTrade(
  tradeData: TradeData,
  env: Env
): Promise<ServiceResponse> {
  if (!env.TRADE_SERVICE) {
    console.error("TRADE_SERVICE binding is not configured.");
    return { success: false, error: "Trade service binding not available" };
  }
  // Fetch internal key
  let internalKey: string | null = null;
  try {
      internalKey = await env.INTERNAL_KEY_BINDING?.get();
      if (!internalKey) {
          throw new Error("Internal key binding not available or configured.");
      }
  } catch (e: any) {
      console.error("Failed to get internal key for trade service call:", e);
      return { success: false, error: e.message || "Internal key retrieval failed" };
  }

  try {
    const tradePayload = {
      exchange: tradeData.exchange,
      action: tradeData.action,
      symbol: tradeData.symbol,
      quantity: tradeData.quantity,
      price: tradeData.price,
      leverage: tradeData.leverage,
    };

    // Create a new request to send via the binding
    // Use a path that the trade-worker will handle, e.g., "/webhook"
    const serviceRequest = new Request(`https://trade-service/webhook`, { // Dummy base URL, important path
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": tradeData.requestId,
        "X-Internal-Key": internalKey, // Add internal key header
      },
      body: JSON.stringify(tradePayload),
    });

    console.log(`[processTrade] Calling TRADE_SERVICE for request ID: ${tradeData.requestId}`);
     // Pass the constructed Request object, casting to RequestInfo
    const response = await env.TRADE_SERVICE.fetch(serviceRequest as RequestInfo);
    console.log(`[processTrade] TRADE_SERVICE response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[processTrade] Trade worker service binding returned error ${response.status}: ${errorText}`
      );
      return {
        success: false,
        requestId: tradeData.requestId,
        error: `Trade worker failed (${response.status}): ${errorText}`,
      };
    }

    const result: ServiceResponse = await response.json();
    console.log(`[processTrade] Trade service response for ${tradeData.requestId}:`, result);
    return result;

  } catch (error: unknown) {
    // Use unknown for caught errors
    const errorMsg = error instanceof Error ? error.message : String(error || "Failed to call trade service");
    console.error(
      `[processTrade] Error calling trade service for ${tradeData.requestId}:`,
      error
    );
    return {
      success: false,
      requestId: tradeData.requestId,
      error: errorMsg,
    };
  }
}

// Forward to notification worker using Service Binding
async function processNotification(
  notificationData: NotificationData,
  env: Env
): Promise<ServiceResponse> {
   // Check if the service binding exists
  if (!env.TELEGRAM_SERVICE) {
    console.error("TELEGRAM_SERVICE binding is not configured.");
    return { success: false, error: "Telegram service binding not available" };
  }
  
  // Fetch internal key
  let internalKey: string | null = null;
  try {
      internalKey = await env.INTERNAL_KEY_BINDING?.get();
      if (!internalKey) {
          throw new Error("Internal key binding not available or configured.");
      }
  } catch (e: any) {
      console.error("Failed to get internal key for telegram service call:", e);
      return { success: false, error: e.message || "Internal key retrieval failed" };
  }

  try {
    // Construct payload directly for the telegram worker
    const notificationPayload = {
        message: notificationData.message,
        chatId: notificationData.chatId, // Pass chatId directly
    };

    // Create a new request to send via the binding
    const serviceRequest = new Request(`https://telegram-service/webhook`, { // Path matches telegram-worker's webhook endpoint
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": notificationData.requestId, // Pass request ID for tracing
        "X-Internal-Key": internalKey, // Add internal key header
      },
      body: JSON.stringify(notificationPayload),
    });

    console.log(`[processNotification] Calling TELEGRAM_SERVICE for request ID: ${notificationData.requestId}`);
    const response = await env.TELEGRAM_SERVICE.fetch(serviceRequest as RequestInfo); // Use cast like before if needed
    console.log(`[processNotification] TELEGRAM_SERVICE response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[processNotification] Telegram worker service binding returned error ${response.status}: ${errorText}`
      );
      return {
        success: false,
        requestId: notificationData.requestId,
        error: `Telegram worker failed (${response.status}): ${errorText}`,
      };
    }
    const result: ServiceResponse = await response.json(); // Assuming telegram worker returns ServiceResponse
    console.log(`[processNotification] Telegram service response for ${notificationData.requestId}:`, result);
    return result;

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error || "Failed to call telegram service");
    console.error(
      `[processNotification] Error calling telegram service for ${notificationData.requestId}:`,
      error
    );
    return { success: false, requestId: notificationData.requestId, error: errorMsg };
  }
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
