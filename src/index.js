// webhook-receiver/src/index.js - Public-facing endpoint for TradingView
import { Router } from "itty-router";
const router = Router();

// ES Module format requires a default export
export default {
  async fetch(request, env) {
    return await handleRequest(request, env);
  },
};

// Define SecretBinding structure for clarity (not enforced in JS)
/**
 * @typedef {object} SecretBinding
 * @property {() => Promise<string | null>} get
 */

/**
 * @typedef {object} Env
 * @property {string} [TRADE_WORKER_URL]
 * @property {string} [TELEGRAM_WORKER_URL]
 * @property {SecretBinding} [WEBHOOK_API_KEY_BINDING]
 * @property {SecretBinding} [INTERNAL_KEY_BINDING]
 */

/**
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<Response>}
 */
async function handleRequest(request, env) {
  // Handle TradingView webhook
  if (request.method === "POST") {
    try {
      const data = await request.json();

      // Extract authentication from the payload itself
      const {
        apiKey,
        exchange,
        action,
        symbol,
        quantity,
        price,
        leverage,
        notify,
      } = data;

      // Validate the API key from payload against the secret binding
      const isValidApiKey = await validateApiKey(apiKey, env);

      if (!isValidApiKey) {
        // Don't reveal the reason for security
        return new Response(
          JSON.stringify({
            success: false,
            worker: "webhook-receiver",
            error: "Authentication failed",
          }),
          { status: 403 }
        );
      }

      // Remove the API key from the data before forwarding
      delete data.apiKey;

      // Generate tracking ID
      const requestId = crypto.randomUUID();

      // Process trading signal if present
      let tradeResult = null;
      let tradeWorkerInfo = null;
      if (exchange && action && symbol && quantity) {
        // Get internal key for forwarding
        const internalKey = await env.INTERNAL_KEY_BINDING?.get();
        if (!internalKey) {
          console.error(
            "INTERNAL_KEY_BINDING not configured or accessible for forwarding."
          );
          // Return internal error, don't expose config issue
          return new Response(
            JSON.stringify({
              success: false,
              worker: "webhook-receiver",
              error: "Internal processing error",
            }),
            { status: 500 }
          );
        }
        const tradeResponse = await processTrade(
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
          internalKey
        );
        tradeResult = tradeResponse.result;
        tradeWorkerInfo = {
          success: tradeResponse.success,
          error: tradeResponse.error,
          worker: "trade-worker",
        };
      }

      // Process notification if requested
      let notificationResult = null;
      let notificationWorkerInfo = null;
      if (notify) {
        // Get internal key for forwarding
        const internalKey = await env.INTERNAL_KEY_BINDING?.get();
        if (!internalKey) {
          console.error(
            "INTERNAL_KEY_BINDING not configured or accessible for forwarding."
          );
          return new Response(
            JSON.stringify({
              success: false,
              worker: "webhook-receiver",
              error: "Internal processing error",
            }),
            { status: 500 }
          );
        }
        const notificationResponse = await processNotification(
          {
            requestId,
            message: notify.message || createDefaultMessage(data),
            chatId: notify.chatId,
          },
          env,
          internalKey
        );
        notificationResult = notificationResponse.result;
        notificationWorkerInfo = {
          success: notificationResponse.success,
          error: notificationResponse.error,
          worker: "notification-worker",
        };
      }

      // Return success response with worker information
      return new Response(
        JSON.stringify({
          success: true,
          worker: "webhook-receiver",
          requestId,
          trade: tradeWorkerInfo
            ? {
                ...tradeWorkerInfo,
                result: tradeResult,
              }
            : null,
          notification: notificationWorkerInfo
            ? {
                ...notificationWorkerInfo,
                result: notificationResult,
              }
            : null,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    } catch (error) {
      console.error("Error processing webhook:", error);

      // Generic error response with worker info
      return new Response(
        JSON.stringify({
          success: false,
          worker: "webhook-receiver",
          error: "Internal server error",
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }
  }

  // Default response for other methods
  return new Response(
    JSON.stringify({
      success: false,
      worker: "webhook-receiver",
      error: "Method not allowed",
    }),
    {
      status: 405,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

// Secure API key validation using a fixed-time comparison
/**
 * @param {string} apiKey From request payload
 * @param {Env} env
 * @returns {Promise<boolean>}
 */
async function validateApiKey(apiKey, env) {
  if (!apiKey) return false;
  // Get the expected key from the secret binding
  const expectedApiKey = await env.WEBHOOK_API_KEY_BINDING?.get();

  if (!expectedApiKey) {
    console.error(
      "WEBHOOK_API_KEY_BINDING binding not configured or accessible"
    );
    return false; // Treat as invalid if secret isn't set up
  }

  // Use a hash comparison for security (example using subtle crypto if available)
  // Or timing-safe string comparison as before
  // const encoder = new TextEncoder();
  // const knownKey = expectedApiKey;

  // Timing-safe comparison
  if (apiKey.length !== expectedApiKey.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < apiKey.length; i++) {
    result |= apiKey.charCodeAt(i) ^ expectedApiKey.charCodeAt(i);
  }
  return result === 0;
}

// Forward to trade worker (pass internalKey)
/**
 * @param {object} tradeData
 * @param {Env} env
 * @param {string} internalKey
 * @returns {Promise<object>}
 */
async function processTrade(tradeData, env, internalKey) {
  try {
    const response = await fetch(env.TRADE_WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": internalKey, // Use passed key
        "X-Request-ID": tradeData.requestId,
      },
      body: JSON.stringify(tradeData),
    });

    return response.json();
  } catch (error) {
    console.error("Error forwarding to trade service:", error);
    return { error: "Processing error" };
  }
}

// Forward to notification worker (pass internalKey)
/**
 * @param {object} notificationData
 * @param {Env} env
 * @param {string} internalKey
 * @returns {Promise<object>}
 */
async function processNotification(notificationData, env, internalKey) {
  try {
    const response = await fetch(env.TELEGRAM_WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": internalKey, // Use passed key
        "X-Request-ID": notificationData.requestId,
      },
      body: JSON.stringify(notificationData),
    });

    return response.json();
  } catch (error) {
    console.error("Error forwarding to notification service:", error);
    return { error: "Notification error" };
  }
}

// Create default message from trade data
function createDefaultMessage(data) {
  const { exchange, action, symbol, quantity, price } = data;
  let message = `📊 Trade Alert: ${action} ${symbol}\n`;
  message += `📈 Exchange: ${exchange}\n`;
  message += `💰 Quantity: ${quantity}\n`;

  if (price) {
    message += `💵 Price: ${price}\n`;
  }

  return message;
}
