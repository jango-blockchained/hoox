import {
  Errors,
  toError,
  createJsonResponse,
} from "@jango-blockchained/hoox-shared/errors";
import { validateJson } from "@jango-blockchained/hoox-shared/middleware";
import { WebhookPayloadSchema } from "@jango-blockchained/hoox-shared/types";
import { trackAnalytics } from "@jango-blockchained/hoox-shared/analytics";
import { serviceFetch } from "@jango-blockchained/hoox-shared/service-bindings";
import { KVKeys } from "@jango-blockchained/hoox-shared/kvKeys";

import { checkIpAllowlist } from "../ipAllowlist";
import { checkKillSwitch } from "../killSwitch";
import { getOrCreateSession } from "../sessionManager";
import { validateApiKeyBinding } from "../utils/security";
import {
  WebhookData,
  TradeData,
  NotificationData,
  ServiceResponse,
  QueueMode,
} from "../types";

/**
 * Main request handler for the /webhook endpoint.
 */
export async function handleRequest(
  request: Request,
  env: any,
  ctx: ExecutionContext,
  logger: any,
  options: {
    wrapResponse: (res: Response) => Response;
    checkRateLimit: (sessionId: string, env: any) => Promise<boolean>;
    processTrade: (
      data: TradeData,
      env: any,
      mode: QueueMode
    ) => Promise<ServiceResponse>;
    processNotification: (
      data: NotificationData,
      env: any
    ) => Promise<ServiceResponse>;
    getQueueMode: (kv: KVNamespace) => Promise<QueueMode>;
    createDefaultMessage: (data: WebhookData) => string;
  }
): Promise<Response> {
  const startTime = Date.now();
  const {
    wrapResponse,
    checkRateLimit,
    processTrade,
    processNotification,
    getQueueMode,
    createDefaultMessage,
  } = options;

  // Check kill switch first (before any KV reads or processing)
  const ksCheck = await checkKillSwitch(env.CONFIG_KV);
  if (ksCheck.enabled) {
    logger.warn("[handleRequest] Kill switch active — rejecting request");
    return wrapResponse(
      createJsonResponse(
        { success: false, error: "Service temporarily disabled" },
        503
      )
    );
  }

  // Check IP allowlist (TradingView IP restriction)
  const clientIp = request.headers.get("CF-Connecting-IP") || "";
  const ipCheck = await checkIpAllowlist(env.CONFIG_KV, clientIp);
  if (!ipCheck.allowed) {
    logger.warn(`[handleRequest] IP ${clientIp} rejected: ${ipCheck.reason}`);
    return wrapResponse(
      createJsonResponse(
        { success: false, error: `Access denied: ${ipCheck.reason}` },
        403
      )
    );
  }

  // Check request body size before parsing (prevent oversized payloads)
  const MAX_PAYLOAD_SIZE = 100_000;
  const contentLength = parseInt(
    request.headers.get("Content-Length") || "0",
    10
  );
  if (contentLength > MAX_PAYLOAD_SIZE) {
    logger.warn(`[handleRequest] Payload too large: ${contentLength} bytes`);
    return wrapResponse(
      createJsonResponse({ success: false, error: "Payload too large" }, 413)
    );
  }

  try {
    const data: WebhookData = await request.json();

    // Validate the API key using the secret binding
    const { apiKey } = data;
    if (!apiKey) {
      logger.warn("[handleRequest] apiKey missing from payload");
      return wrapResponse(
        createJsonResponse({ success: false, error: "Forbidden" }, 403)
      );
    }

    const isValid = await validateApiKeyBinding(
      apiKey,
      env.WEBHOOK_API_KEY_BINDING,
      logger
    );
    if (!isValid) {
      logger.warn("[handleRequest] Invalid apiKey provided");
      return wrapResponse(
        createJsonResponse({ success: false, error: "Forbidden" }, 403)
      );
    }

    // Get or create session for tracking (use validated apiKey before it's removed)
    const session = await getOrCreateSession(env.SESSIONS_KV, apiKey);

    // Check rate limit using session ID (not request UUID — was broken before)
    if (!(await checkRateLimit(session.sessionId, env))) {
      logger.warn("[handleRequest] Rate limit exceeded");
      return wrapResponse(
        createJsonResponse(
          { success: false, error: "Rate limit exceeded. Try again later." },
          429
        )
      );
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
        return wrapResponse(
          createJsonResponse(
            {
              success: false,
              error: `Invalid trade payload: ${validation.error}`,
            },
            400
          )
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
      return wrapResponse(
        createJsonResponse(
          {
            success: true,
            requestId,
            tradeResult,
            notificationResult,
          },
          200
        )
      );
    } else {
      logger.info(
        `[handleRequest] Returning FAILURE response (status 500) for ${requestId} due to: ${errorMessages.join(
          "; "
        )}`
      );
      return wrapResponse(
        createJsonResponse(
          {
            success: false,
            requestId,
            error: `Processing failed: ${errorMessages.join("; ")}`,
            tradeResult, // Include partial results/errors
            notificationResult,
          },
          500
        )
      );
    }
  } catch (error: unknown) {
    const errorMsg = toError(error, "Internal Server Error");
    logger.error(`[handleRequest] Uncaught error: ${errorMsg}`, {
      error: toError(error),
    });
    return wrapResponse(Errors.internal(errorMsg));
  }
}
