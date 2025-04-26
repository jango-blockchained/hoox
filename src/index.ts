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

      // Process trading signal if present
      let tradeResult: ServiceResponse | null = null;
      if (exchange && action && symbol && quantity) {
        // Forward to trade worker
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
      }

      // Return success response
      return new Response(
        JSON.stringify({
          success: true,
          requestId,
          tradeResult,
          notificationResult,
        }),
        { status: 200 }
      );
    } catch (error) {
      console.error("Error processing webhook:", error);

      // Generic error response (don't expose details)
      return new Response(
        JSON.stringify({
          success: false,
        }),
        { status: 500 }
      );
    }
  }

  // Default response for other methods
  return new Response("Method not allowed", { status: 405 });
}

// Secure API key validation using a fixed-time comparison
async function validateApiKey(apiKey: string, env: Env): Promise<boolean> {
  if (!apiKey) return false;

  // Use a hash comparison for security
  const utf8Encode = new TextEncoder();
  const _encoder = utf8Encode; // Prefix encoder
  const knownKey = env.API_SECRET_KEY; // From environment variable

  // Timing-safe comparison
  if (apiKey.length !== knownKey.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < apiKey.length; i++) {
    result |= apiKey.charCodeAt(i) ^ knownKey.charCodeAt(i);
  }

  return result === 0;
}

// Forward to trade worker
async function processTrade(
  _signal: TradeData, // Prefix signal
  env: Env
): Promise<ServiceResponse> {
  try {
    const response = await fetch(env.TRADE_WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": env.INTERNAL_SERVICE_KEY,
        "X-Request-ID": _signal.requestId,
      },
      body: JSON.stringify(_signal),
    });

    return response.json();
  } catch (error) {
    console.error("Error forwarding to trade service:", error);
    return { success: false, error: "Processing error" };
  }
}

// Forward to notification worker
async function processNotification(
  _signal: NotificationData, // Prefix signal
  env: Env
): Promise<ServiceResponse> {
  try {
    const response = await fetch(env.TELEGRAM_WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": env.INTERNAL_SERVICE_KEY,
        "X-Request-ID": _signal.requestId,
      },
      body: JSON.stringify(_signal),
    });

    return response.json();
  } catch (error) {
    console.error("Error forwarding to notification service:", error);
    return { success: false, error: "Notification error" };
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
