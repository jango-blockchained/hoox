/**
 * @hoox/shared — Shared module for HOOX (Open Core)
 *
 * Barrel export: re-exports all shared utilities, types, stores, and TUI helpers.
 *
 * This package is part of the **Open Core**.
 * Enterprise-only extensions (advanced multi-tenancy, billing, proprietary features)
 * live in a separate closed-source repository.
 *
 * See: /OPEN_CORE.md and /OPEN_CORE_FEATURE_SPLIT.md
 */

// ── Legal boilerplate ─────────────────────────────────────────────────────

export {
  COPYRIGHT,
  TRADEMARKS,
  TRADEMARK_NOTICE,
  DISCLAIMER,
  FULL_LEGAL_NOTICE,
  DISCLAIMER_HEADER,
} from "./legal";

// ── Original shared exports (CLI + Workers) ──────────────────────────────

export type {
  StandardResponse,
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiResponse,
  WorkerServiceBinding,
  WorkerD1Binding,
  WorkerSecretsStoreBinding,
  WorkerQueueConfig,
  HousekeepingCheck,
  HousekeepingPayload,
  HousekeepingSummary,
  SettingsPayload,
  ProcessRequestBody,
  BaseEnv,
  Result,
} from "./types";
export {
  TradeActionSchema,
  WebhookPayloadSchema,
  TradeQueueMessageSchema,
  TradeSignalSchema,
  PositionSchema,
  BalanceSchema,
} from "./types";
export type {
  TradeAction,
  WebhookPayload,
  TradeQueueMessage,
  TradeSignal,
} from "./types";
export { KVKeys } from "./kvKeys";
export {
  toError,
  Errors,
  createJsonResponse,
  createSuccessResponse,
  createErrorResponse,
} from "./errors";

export { ExchangeRouter } from "./exchange-client";
export type {
  ExchangeName,
  ExchangeConfig,
  TradeParams,
  OrderResponse,
  Position,
  IExchangeProvider,
} from "./exchange-client";

// ── Exchange client abstractions ───────────────────────────────────────────

export { BaseExchangeClient } from "./exchanges";
export type { SupportedExchange } from "./exchanges";
export { logKvTimestamp, headersToObject } from "./kvUtils";
export type { EnvWithKV } from "./kvUtils";
export { trackAnalytics } from "./analytics";
export type { AnalyticsEnv } from "./analytics";
export { healthCheck } from "./health";
export type { HealthCheckOptions } from "./health";
export { createQueueHandler } from "./queue-handler";
export type { QueueHandlerOptions } from "./queue-handler";
export { createCronHandler } from "./cron-handler";
export type { CronHandlerOptions } from "./cron-handler";
export { D1Repository } from "./d1/index";
export {
  serviceFetch,
  authenticatedServiceFetch,
  ServiceAuthError,
  InternalAuthKeyFields,
  D1_READ_AUTH_KEY_FIELDS,
  D1_WRITE_AUTH_KEY_FIELDS,
  TRADE_EXECUTE_AUTH_KEY_FIELDS,
  TRADE_READ_AUTH_KEY_FIELDS,
  TELEGRAM_ALERT_AUTH_KEY_FIELDS,
  WALLET_EXECUTE_AUTH_KEY_FIELDS,
  DASHBOARD_D1_READ_AUTH_KEY_FIELDS,
  DASHBOARD_TRADE_EXECUTE_AUTH_KEY_FIELDS,
  DASHBOARD_TELEGRAM_ALERT_AUTH_KEY_FIELDS,
  resolveInternalAuthKey,
} from "./service-bindings";
export type { AuthenticatedServiceEnv } from "./service-bindings";
export type {
  TradeRecord,
  PositionRecord,
  BalanceRecord,
  SystemLogRecord,
  TradeSignalRecord,
  D1QueryResult,
  BatchStatement,
} from "./d1/index";

// ── Test utilities ─────────────────────────────────────────────────────────

export * from "./test-utils";

// ── New TUI shared exports ────────────────────────────────────────────────

export {
  Colors,
  CoolBracketPalette,
  ConnectionStatusColor,
  WorkerStatusColor,
  LogLevelColor,
  AlertSeverityColor,
} from "./colors";
export type {
  ColorKey,
  CoolBracketColor,
  ConnectionStatusKey,
  WorkerStatusKey,
  LogLevelColorKey,
  AlertSeverityColorKey,
} from "./colors";

export {
  formatNumber,
  formatCurrency,
  formatCompactCurrency,
  formatDuration,
  formatDurationCompact,
  formatTimestamp,
  formatRelativeTime,
  formatPercent,
  formatUptime,
  formatLatency,
  formatRequests,
  formatMemory,
  formatCpu,
} from "./formatters";

export {
  readConfigSync,
  readConfig,
  writeConfigSync,
  writeConfig,
  validateConfig,
  ensureHooxDirSecure,
  writeSecureFileSync,
  isUnixModeGroupOrWorldAccessible,
  isConfigWorldOrGroupReadable,
  formatConfigPermissionWarning,
  HOOX_DIR_MODE,
  HOOX_CONFIG_FILE_MODE,
} from "./config";
export type { HooxConfig, HooxConfigTransport } from "./config";

export { hooxFetch, WorkerAPIError } from "./api-client";
export type { HooxFetchOptions } from "./api-client";
export { subscribeSSE } from "./sse";
export type {
  SSECallback,
  SSEStatusCallback,
  SubscribeSSEOptions,
} from "./sse";
export {
  resolveOperatorTransportProfile,
  buildOperatorAuthHeaders,
  hasOperatorClientCredentials,
  operatorUrl,
} from "./operator-transport";
export type {
  OperatorTransport,
  OperatorTransportProfile,
  OperatorTransportEnv,
  ResolveOperatorTransportOptions,
} from "./operator-transport";
export { restoreSession, saveSession } from "./session";
export type { SessionState } from "./session";
export { formatRelativeTime as formatRelativeTimeFromTime } from "./format-time";

// TUI-specific types
export type {
  ViewId,
  ModalState,
  WorkerStatus,
  WorkerInfo,
  TradeSide,
  Trade,
  AlertSeverity,
  Alert,
  LogLevel,
  LogEntry,
  SystemMetrics,
  ConnectionStatus,
  LogFilter,
  NotificationPreferences,
  CliErrorType,
  CliErrorDetails,
} from "./types";

// ── Path Resolution Service ────────────────────────────────────────────

export {
  getHooxHome,
  resolveHooxPath,
  isWithinHooxHome,
  getRelativeHooxPath,
  getHooxRepoPath,
  getHooxConfigDir,
  getHooxDataDir,
  getHooxWranglerPath,
  getHooxStatePath,
  isHooxSetupRoot,
  findHooxSetupRoot,
  resolveHooxRuntimeRoot,
  getTuiEntryCandidates,
} from "./path-utils";
export type {
  HooxPath,
  RuntimeRootSource,
  RuntimeRootResult,
} from "./path-utils";

// ── Wizard engine ──────────────────────────────────────────────────────

export type {
  StepId,
  WorkerPresetName,
  WorkerPreset,
  WorkerConfig,
  WorkersJsonConfig,
  IntegratedService,
  ProvisioningPlan,
  ProvisionResult,
  WizardCloudflareConfig,
  WizardState,
  StepDefinition,
} from "./wizard";
export type { Provisioner } from "./wizard";
export {
  WizardEngine,
  PRESETS,
  WORKER_DEPENDENCIES,
  INTEGRATIONS,
  resolveDependencies,
  serializeState,
  deserializeState,
  WIZARD_STATE_PATH,
} from "./wizard";

// ── Worker Manifest Schema ──────────────────────────────────────────────

export * from "./schemas/index.js";

// Zustand stores
export { useUIStore } from "./stores/ui-store";
export { useServiceStore } from "./stores/service-store";
export { useConfigStore } from "./stores/config-store";
export type { UIState } from "./stores/ui-store";
export type { ServiceState } from "./stores/service-store";
export type { ConfigState } from "./stores/config-store";
