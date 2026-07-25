/**
 * Barrel exports for shared middleware
 */

export {
  createLogger,
  withRequestLog,
  type Logger,
  type LogContext,
} from "./logger";
export {
  requireAuth,
  requireOperatorAuth,
  createOperatorAuthMiddleware,
  resolveOperatorApiKey,
  requireInternalAuth,
  createInternalAuthMiddleware,
  checkInternalAuth,
  timingSafeEqual,
  collectInternalAuthKeys,
  type InternalAuthEnv,
  type InternalAuthKeyName,
  type OperatorAuthEnv,
} from "./auth";
export {
  createRateLimiter,
  type RateLimiter,
  type RateLimitConfig,
} from "./rate-limit";
export {
  validateJson,
  validateJsonLegacy,
  requireField,
  optionalField,
} from "./validate";
export {
  corsHeaders,
  resolveCorsOptions,
  type CorsEnv,
  publicCorsHeaders,
  internalCorsHeaders,
  handleCorsPreflightRequest,
  type CorsOptions,
} from "./cors";
export {
  secureHeaders,
  wrapWithSecurityHeaders,
  type SecurityHeadersOptions,
  SECURITY_HEADERS_DEFAULTS,
} from "./security-headers";
