import {
  Errors,
  toError,
  createJsonResponse,
} from "@jango-blockchained/hoox-shared/errors";
import {
  validateJson,
  type Logger,
} from "@jango-blockchained/hoox-shared/middleware";
import { WebhookPayloadSchema } from "@jango-blockchained/hoox-shared/types";
import { trackAnalytics } from "@jango-blockchained/hoox-shared/analytics";

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
  env: Env,
  ctx: ExecutionContext,
  logger: Logger,
  options: {
    wrapResponse: (res: Response) => Response;
    checkRateLimit: (sessionId: string, env: Env) => Promise<boolean>;
    processTrade: (
      data: TradeData,
      env: Env,
      mode: QueueMode
    ) => Promise<ServiceResponse>;
    processNotification: (
      data: NotificationData,
      env: Env
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

    // Extract API key early for parallel validation
    const { apiKey } = data;
    if (!apiKey) {
      logger.warn("[handleRequest] apiKey missing from payload");
      return wrapResponse(
        createJsonResponse({ success: false, error: "Forbidden" }, 403)
      );
    }

    const clientIp = request.headers.get("CF-Connecting-IP") || "";

    // Run independent checks in parallel (all KV reads, no dependencies)
    const [ksCheck, ipCheck, isValid] = await Promise.all([
      checkKillSwitch(env.CONFIG_KV),
      checkIpAllowlist(env.CONFIG_KV, clientIp),
      validateApiKeyBinding(apiKey, env.WEBHOOK_API_KEY_BINDING, logger),
    ]);

    // Evaluate in priority order (fail-fast)
    if (ksCheck.enabled) {
      logger.warn("[handleRequest] Kill switch active — rejecting request");
      return wrapResponse(
        createJsonResponse(
          { success: false, error: "Service temporarily disabled" },
          503
        )
      );
    }

    if (!ipCheck.allowed) {
      logger.warn(`[handleRequest] IP ${clientIp} rejected: ${ipCheck.reason}`);
      return wrapResponse(
        createJsonResponse(
          { success: false, error: `Access denied: ${ipCheck.reason}` },
          403
        )
      );
    }

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
    let notificationResult: ServiceResponse | null = null;
    const queueMode = await getQueueMode(env.CONFIG_KV);
    const hasTrade = exchange && action && symbol && quantity;
    const hasNotification = !!notify;

    // Build trade promise (validates payload first)
    let tradePromise: Promise<ServiceResponse> | null = null;
    if (hasTrade) {
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
      tradePromise = processTrade(
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
    }

    // Build notification promise
    let notificationPromise: Promise<ServiceResponse> | null = null;
    if (hasNotification) {
      notificationPromise = processNotification(
        {
          requestId,
          message: notify!.message || createDefaultMessage(data),
          chatId: notify!.chatId,
        },
        env
      );
    }

    // Run trade + notification in parallel when both are needed
    if (tradePromise && notificationPromise) {
      const [tradeRes, notifRes] = await Promise.all([
        tradePromise,
        notificationPromise,
      ]);
      tradeResult = tradeRes;
      notificationResult = notifRes;
      if (!tradeResult?.success) {
        overallSuccess = false;
        errorMessages.push(tradeResult?.error || "Trade processing failed");
        logger.error(`Trade processing failed for ${requestId}`, {
          error: tradeResult?.error,
        });
      }
      if (!notificationResult?.success) {
        overallSuccess = false;
        errorMessages.push(
          notificationResult?.error || "Notification processing failed"
        );
        logger.error(`Notification processing failed for ${requestId}`, {
          error: notificationResult?.error,
        });
      }
    } else {
      // Single operation or none
      if (tradePromise) {
        tradeResult = await tradePromise;
        if (!tradeResult?.success) {
          overallSuccess = false;
          errorMessages.push(tradeResult?.error || "Trade processing failed");
          logger.error(`Trade processing failed for ${requestId}`, {
            error: tradeResult?.error,
          });
        }
      }
      if (notificationPromise) {
        notificationResult = await notificationPromise;
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
