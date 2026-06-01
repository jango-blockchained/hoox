import { timingSafeEqual } from "@jango-blockchained/hoox-shared/middleware";
import { toError } from "@jango-blockchained/hoox-shared/errors";

/**
 * Secure API key validation using a secret binding.
 */
export async function validateApiKeyBinding(
  apiKey: string,
  binding?: string,
  logger?: any
): Promise<boolean> {
  if (!binding) {
    logger?.error(
      "[validateApiKeyBinding] WEBHOOK_API_KEY_BINDING is not configured."
    );
    return false;
  }
  try {
    const expectedKey = binding;
    if (!expectedKey) {
      logger?.error(
        "[validateApiKeyBinding] Failed to retrieve key from binding."
      );
      return false;
    }
    // Constant-time comparison to prevent timing attacks on API key
    const isValid = timingSafeEqual(apiKey, expectedKey);
    return isValid;
  } catch (e: unknown) {
    const errorMsg = toError(e, "Error retrieving secret");
    logger?.error("[validateApiKeyBinding] Error retrieving secret:", {
      error: errorMsg,
    });
    return false;
  }
}
