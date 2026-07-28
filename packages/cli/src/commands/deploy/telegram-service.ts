/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Service for interacting with the Telegram Bot API.
 * Used by `hoox deploy telegram-webhook`.
 */

export class TelegramService {
  /**
   * Set the webhook for a Telegram bot.
   * POST https://api.telegram.org/bot{TOKEN}/setWebhook
   */
  async setWebhook(
    botToken: string,
    webhookUrl: string,
    secretToken: string
  ): Promise<{ ok: boolean; description?: string; error?: string }> {
    try {
      const url = `https://api.telegram.org/bot${botToken}/setWebhook`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl, secret_token: secretToken }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        description?: string;
      };
      return { ok: data.ok, description: data.description };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Get the current webhook status.
   * GET https://api.telegram.org/bot{TOKEN}/getWebhookInfo
   */
  async getWebhookInfo(botToken: string): Promise<{
    ok: boolean;
    url?: string;
    has_custom_certificate?: boolean;
    pending_update_count?: number;
    error?: string;
  }> {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/getWebhookInfo`
      );
      const data = (await response.json()) as {
        ok: boolean;
        result?: {
          url: string;
          has_custom_certificate: boolean;
          pending_update_count: number;
        };
        description?: string;
      };
      if (data.ok && data.result) {
        return {
          ok: true,
          url: data.result.url,
          has_custom_certificate: data.result.has_custom_certificate,
          pending_update_count: data.result.pending_update_count,
        };
      }
      return { ok: false, error: data.description };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
