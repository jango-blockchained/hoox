/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Centralized KV key registry for Hoox workers.
 * Use these constants instead of string literals to prevent typos.
 *
 * Key naming convention: <namespace>:<key>
 * - trade:* - Trade execution settings
 * - bot:* - Telegram bot settings
 * - webhook:* - Webhook configuration
 * - email:* - Email worker settings
 * - agent:* - Agent worker settings
 * - dashboard:* - Dashboard settings
 * - global:* - Global settings
 */

// --- Trade Execution Keys ---
export const KV_TRADE_DEFAULT_LEVERAGE = "trade:default_leverage";
export const KV_TRADE_MAX_POSITION_SIZE = "trade:max_position_size";
export const KV_TRADE_MAX_DAILY_DRAWDOWN_PERCENT =
  "trade:max_daily_drawdown_percent";
export const KV_TRADE_TRAILING_STOP_PERCENT = "trade:trailing_stop_percent";
export const KV_TRADE_KILL_SWITCH = "trade:kill_switch";
export const KV_TRADE_ROUTING = "trade:routing";

// --- Telegram Bot Keys ---
export const KV_BOT_ENABLED = "bot:enabled";
export const KV_BOT_DEFAULT_CHAT_ID = "bot:default_chat_id";
export const KV_BOT_NOTIFY_ON_EXECUTION = "bot:notify_on_execution";
export const KV_BOT_NOTIFY_ON_ERROR = "bot:notify_on_error";

// --- Webhook Keys ---
export const KV_WEBHOOK_IP_CHECK_ENABLED =
  "webhook:tradingview:ip_check_enabled";
export const KV_WEBHOOK_ALLOWED_IPS = "webhook:tradingview:allowed_ips";
export const KV_WEBHOOK_QUEUE_MODE = "webhook:queue_mode";

// --- Email Worker Keys ---
export const KV_EMAIL_SCAN_SUBJECT = "email:scan_subject";
export const KV_EMAIL_USE_IMAP = "email:use_imap";
export const KV_EMAIL_COIN_PATTERN = "email:coin_pattern";
export const KV_EMAIL_ACTION_PATTERN = "email:action_pattern";
export const KV_EMAIL_QUANTITY_MULTIPLIER = "email:quantity_multiplier";

// --- Agent Worker Keys ---
export const KV_AGENT_CONFIG = "agent:config";
export const KV_AGENT_OPENAI_KEY = "agent:openai_key";
export const KV_AGENT_ANTHROPIC_KEY = "agent:anthropic_key";
export const KV_AGENT_GOOGLE_KEY = "agent:google_key";

// --- Dashboard Keys ---
export const KV_DASHBOARD_AI_HEALTH_SUMMARY = "dashboard:ai_health_summary";

// --- Global Keys ---
export const KV_HEALTH_CHECK = "health_check";
export const KV_HOUSEKEEPING_LAST_CHECK = "housekeeping:last_check";

// --- Queue Mode Values ---
export const QUEUE_MODE_FAILOVER = "queue_failover";
export const QUEUE_MODE_EVERYWHERE = "queue_everywhere";
export const QUEUE_MODE_DISABLED = "queue_disabled";

// --- KVKeys Namespace ---
// Provides a grouped namespace for all KV key constants.
// Import as: import { KVKeys } from '@hoox-sh/hoox-shared/kvKeys';
export const KVKeys = {
  KV_TRADE_DEFAULT_LEVERAGE,
  KV_TRADE_MAX_POSITION_SIZE,
  KV_TRADE_MAX_DAILY_DRAWDOWN_PERCENT,
  KV_TRADE_TRAILING_STOP_PERCENT,
  KV_TRADE_KILL_SWITCH,
  KV_TRADE_ROUTING,
  KV_BOT_ENABLED,
  KV_BOT_DEFAULT_CHAT_ID,
  KV_BOT_NOTIFY_ON_EXECUTION,
  KV_BOT_NOTIFY_ON_ERROR,
  KV_WEBHOOK_IP_CHECK_ENABLED,
  KV_WEBHOOK_ALLOWED_IPS,
  KV_WEBHOOK_QUEUE_MODE,
  KV_EMAIL_SCAN_SUBJECT,
  KV_EMAIL_USE_IMAP,
  KV_EMAIL_COIN_PATTERN,
  KV_EMAIL_ACTION_PATTERN,
  KV_EMAIL_QUANTITY_MULTIPLIER,
  KV_AGENT_CONFIG,
  KV_AGENT_OPENAI_KEY,
  KV_AGENT_ANTHROPIC_KEY,
  KV_AGENT_GOOGLE_KEY,
  KV_DASHBOARD_AI_HEALTH_SUMMARY,
  KV_HEALTH_CHECK,
  KV_HOUSEKEEPING_LAST_CHECK,
  QUEUE_MODE_FAILOVER,
  QUEUE_MODE_EVERYWHERE,
  QUEUE_MODE_DISABLED,
};
