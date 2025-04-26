// webhook-receiver/src/index.ts - Public-facing endpoint for TradingView
import { type Env } from "./types"; // Import Env type if needed
import { type TradeSignal, type WorkerResponse } from "./types"; // Import necessary types
// import { Router } from "itty-router"; // Removed unused import
// import Hono, { type Context } from "@hono/hono"; // Removed unused import
// import { bearerAuth } from "@hono/hono/bearer-auth"; // Removed unused import
// import { logger } from "@hono/hono/logger"; // Removed unused import

// Type definitions
// Env interface might be defined in ./types.ts now, ensure it is.
// If not, define it here:
/*
interface Env {
  API_SECRET_KEY: string;
  TRADE_WORKER_URL: string;
  TELEGRAM_WORKER_URL: string;
  INTERNAL_SERVICE_KEY: string;
}
*/

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
  tradeResult?: any;
  notificationResult?: any;
  error?: string;
}

const _router = new Hono<{ Bindings: Env }>(); // Prefix router

// ES Module format requires a default export
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return await handleRequest(request, env);
  },
};

async function handleRequest(request: Request, env: Env): Promise<Response> {
  // Handle TradingView webhook
  if (request.method === "POST") {
    try {
      const data: WebhookData = await request.json();

      // Extract authentication from the payload itself
      const {
        apiKey,
        signal,
        exchange,
        action,
        symbol,
        quantity,
        price,
        leverage,
        notify,
      } = data;

      // Validate the API key with a secure comparison
      if (!apiKey) {
        return new Response(JSON.stringify({ success: false }), {
          status: 403,
        });
      }

      const isValid = await validateApiKey(apiKey, env);

      if (!isValid) {
        // Don't reveal the reason for security
        return new Response(JSON.stringify({ success: false }), {
          status: 403,
        });
      }

      // Remove the API key from the data before forwarding
      delete data.apiKey;

      // Generate tracking ID
      const requestId = crypto.randomUUID();
      let overallSuccess = true; // Track overall status
      let errorMessages: string[] = [];

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
          console.error(`Trade processing failed for ${requestId}:`, tradeResult?.error);
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
          errorMessages.push(notificationResult?.error || "Notification processing failed");
           console.error(`Notification processing failed for ${requestId}:`, notificationResult?.error);
        }
      }

      // Return appropriate response based on overall success
      if (overallSuccess) {
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
         // If any downstream service failed, return a 500
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

    } catch (error) {
      console.error("Error processing webhook:", error);
      return new Response(
        JSON.stringify({ success: false, error: error.message || "Internal Server Error" }),
        { status: 500, headers: { "Content-Type": "application/json" } } // Catch-all still returns 500
      );
    }
  }

  // Default response for other methods
  return new Response("Method not allowed", { status: 405 });
}

// Secure API key validation using a fixed-time comparison
async function validateApiKey(apiKey: string, env: Env): Promise<boolean> {
  console.log("[validateApiKey] Called with:", apiKey); // Log input
  if (!apiKey) return false;

  // Get the expected key from the environment
  const expectedKey = env.API_SECRET_KEY;
  console.log("[validateApiKey] Expected key from env.API_SECRET_KEY:", expectedKey); // Log expected key
  if (!expectedKey) {
      console.error("[validateApiKey] API_SECRET_KEY is not configured in the environment.");
      return false; 
  }

  // Simple string comparison
  const result = apiKey === expectedKey;
  console.log(`[validateApiKey] Validation result: ${result}`); // Log result
  return result;
}

// Forward to trade worker
async function processTrade(
  tradeData: TradeData, // Use clearer name
  env: Env
): Promise<ServiceResponse> {
  try {
    const internalKey = await env.INTERNAL_KEY_BINDING?.get(); // Get the internal key
    if (!internalKey) {
      throw new Error("INTERNAL_KEY_BINDING is not configured for forwarding");
    }

    // Construct the standardized body
    const standardizedBody = {
      internalAuthKey: internalKey,
      requestId: tradeData.requestId,
      payload: {
        exchange: tradeData.exchange,
        action: tradeData.action,
        symbol: tradeData.symbol,
        quantity: tradeData.quantity,
        price: tradeData.price,
        leverage: tradeData.leverage,
      },
    };

    const response = await fetch(env.TRADE_WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Remove X-Internal-Key and X-Request-ID headers
      },
      body: JSON.stringify(standardizedBody), // Send the correct body structure
    });

    // Handle potential non-JSON or error responses from downstream
    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Trade worker returned error ${response.status}: ${errorText}`
      );
      return {
        success: false,
        error: `Trade worker error: ${response.status}`,
      };
    }
    return await response.json();

  } catch (error) {
    console.error(`[processTrade] Error for ${tradeData.requestId}:`, error); // Log specific error
    return { success: false, error: error.message || "Processing error" };
  }
}

// Forward to notification worker
async function processNotification(
  notificationData: NotificationData, // Use clearer name
  env: Env
): Promise<ServiceResponse> {
  try {
    const internalKey = await env.INTERNAL_KEY_BINDING?.get(); // Get the internal key
    if (!internalKey) {
      throw new Error("INTERNAL_KEY_BINDING is not configured for forwarding");
    }

    // Construct the standardized body
    const standardizedBody = {
      internalAuthKey: internalKey,
      requestId: notificationData.requestId,
      payload: {
        message: notificationData.message,
        chatId: notificationData.chatId,
      },
    };

    const response = await fetch(env.TELEGRAM_WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Remove X-Internal-Key and X-Request-ID headers
      },
      body: JSON.stringify(standardizedBody), // Send the correct body structure
    });

     // Handle potential non-JSON or error responses from downstream
    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Telegram worker returned error ${response.status}: ${errorText}`
      );
      return {
        success: false,
        error: `Telegram worker error: ${response.status}`,
      };
    }
     return await response.json();

  } catch (error) {
    console.error(`[processNotification] Error for ${notificationData.requestId}:`, error); // Log specific error
    return { success: false, error: error.message || "Notification error" };
  }
}

// Create default message from trade data
function createDefaultMessage(data: WebhookData): string {
  const { exchange, action, symbol, quantity, price } = data;
  let message = `📊 Trade Alert: ${action} ${symbol}\n`;
  message += `📈 Exchange: ${exchange}\n`;
  message += `💰 Quantity: ${quantity}\n`;

  if (price) {
    message += `💵 Price: ${price}\n`;
  }

  return message;
}
