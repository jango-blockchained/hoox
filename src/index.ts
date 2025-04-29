// webhook-receiver/src/index.ts - Public-facing endpoint for TradingView

// Import Fetcher type for service bindings
import type { Fetcher, KVNamespace } from "@cloudflare/workers-types";
import type { Ai } from '@cloudflare/ai'; // Import the Ai type

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
  WEBHOOK_API_KEY_BINDING: SecretBinding; // Secret for incoming API key
  INTERNAL_KEY_BINDING: SecretBinding; // Secret for calling other internal services (e.g., legacy Telegram/HA)
  HA_TOKEN_BINDING?: SecretBinding; // Optional: If HA worker communication is needed
  SESSIONS_KV: KVNamespace; // Added for session management

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
    // Add KV Interaction for session check/update (Example)
    const sessionId = request.headers.get('X-Session-ID') || crypto.randomUUID(); // Example session ID
    try {
      const sessionData = await env.SESSIONS_KV.get(sessionId);
      console.log(`KV: Session data for ${sessionId}:`, sessionData || "New session");
      const newSessionData = JSON.stringify({ lastSeen: new Date().toISOString() });
      await env.SESSIONS_KV.put(sessionId, newSessionData, { expirationTtl: 3600 }); // Example: 1 hour session
      console.log(`KV: Updated session data for ${sessionId}.`);
    } catch (kvError) {
      console.error("KV Session Error:", kvError);
      // Decide if KV error should block the request or just be logged
    }

    // --- Add temporary GET endpoint for testing AI ---
    const url = new URL(request.url); // Need URL object here
    if (request.method === "GET" && url.pathname === "/test-ai") {
      // Ensure this endpoint is removed or secured before production!
      console.warn("Executing temporary /test-ai endpoint...");
      return await handleAiTest(request, env);
    }
    // --- End temporary test endpoint ---

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
  const { requestId } = tradeData;
  console.log(`[${requestId}] processTrade: Received trade data:`, tradeData);

  // --- Task 10.5: Example Inter-Worker Communication ---
  // Example: Call trade-worker service binding
  try {
    // Construct the request for the trade-worker
    // The URL path and body structure depend on the trade-worker's API
    const tradeWorkerRequest = new Request(
      "https://trade-worker.your-domain.workers.dev/execute", // Replace with actual trade-worker endpoint
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Add any necessary internal authentication headers if required by trade-worker
          // 'X-Internal-Auth-Key': await env.INTERNAL_KEY_BINDING?.get() || '',
        },
        body: JSON.stringify(tradeData), // Forward relevant data
      }
    );

    console.log(`[${requestId}] Calling TRADE_API service binding...`);
    // const response = await env.TRADE_API.fetch(tradeWorkerRequest);

    // if (!response.ok) {
    //   const errorText = await response.text();
    //   console.error(
    //     `[${requestId}] Error calling TRADE_API: ${response.status} - ${errorText}`
    //   );
    //   return {
    //     success: false,
    //     requestId,
    //     error: `Trade service call failed: ${response.status} - ${errorText}`,
    //   };
    // }

    // const result = await response.json();
    // console.log(`[${requestId}] Response from TRADE_API:`, result);
    // return { success: true, requestId, tradeResult: result };

    // Placeholder success response until binding is live
    console.log(`[${requestId}] Skipped calling TRADE_API (placeholder).`);
    return { success: true, requestId, tradeResult: { status: "placeholder_success" } };

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error || "Unknown error calling trade service");
    console.error(`[${requestId}] Exception calling TRADE_API:`, errorMsg, error);
    return {
      success: false,
      requestId,
      error: `Exception during trade service call: ${errorMsg}`,
    };
  }
  // --- End Task 10.5 ---
}

// Forward to notification worker using Service Binding
async function processNotification(
  notificationData: NotificationData,
  env: Env
): Promise<ServiceResponse> {
  const { requestId } = notificationData;
  console.log(`[${requestId}] processNotification: Received notification data:`, notificationData);

  // --- Task 10.5: Example Inter-Worker Communication ---
  // Example: Call telegram-worker service binding
  try {
    // Construct the request for the telegram-worker
    // The URL path should match an endpoint handled by telegram-worker, e.g., /webhook
    // The body should match the NotificationPayload expected by telegram-worker
    const telegramWorkerRequest = new Request(
      "https://telegram-worker.your-domain.workers.dev/webhook", // Replace with actual telegram-worker endpoint
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Add any necessary internal authentication headers if required by telegram-worker
          // 'X-Internal-Auth-Key': await env.INTERNAL_KEY_BINDING?.get() || '',
        },
        body: JSON.stringify({
          message: notificationData.message,
          chatId: notificationData.chatId,
          // Optionally include original requestId for tracing?
        }),
      }
    );

    console.log(`[${requestId}] Calling TELEGRAM_API service binding...`);
    // const response = await env.TELEGRAM_API.fetch(telegramWorkerRequest);

    // if (!response.ok) {
    //   const errorText = await response.text();
    //   console.error(
    //     `[${requestId}] Error calling TELEGRAM_API: ${response.status} - ${errorText}`
    //   );
    //   return {
    //     success: false,
    //     requestId,
    //     error: `Telegram service call failed: ${response.status} - ${errorText}`,
    //   };
    // }

    // const result = await response.json();
    // console.log(`[${requestId}] Response from TELEGRAM_API:`, result);
    // return { success: true, requestId, notificationResult: result };

    // Placeholder success response until binding is live
    console.log(`[${requestId}] Skipped calling TELEGRAM_API (placeholder).`);
    return { success: true, requestId, notificationResult: { status: "placeholder_success" } };

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error || "Unknown error calling telegram service");
    console.error(`[${requestId}] Exception calling TELEGRAM_API:`, errorMsg, error);
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
                // Adjust system prompt based on webhook-receiver's potential AI use case
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
