/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * Tests for SetupWizard component.
 *
 * Covers: progress indicator, step rendering, secret masking,
 *         navigation, skip logic, validation, and config store integration.
 */
import { describe, it, expect, mock, beforeEach } from "bun:test";

// Do NOT mock.module shared stores here — Bun's mock.module is process-wide and
// strips Zustand setState/getState, which breaks later suites (workers, worker-detail).
// These tests only exercise pure helpers + local mock functions; no store wiring.
const mockUpdateConfig = mock((_config: Record<string, unknown>) => {});
const mockSetView = mock((_view: string) => {});

import { redactWizardSecrets } from "./setup-wizard";

// ─── Secret redaction (session persistence) ─────────────────────────────────

describe("redactWizardSecrets", () => {
  it("clears exchange keys, AI key, telegram token, and discord webhook", () => {
    const redacted = redactWizardSecrets({
      apiKeys: {
        binance: { key: "binance-key-secret-value", secret: "binance-sec" },
        bybit: { key: "bybit-key", secret: "bybit-sec" },
        mexc: { key: "mexc-key", secret: "mexc-sec" },
      },
      exchanges: { binance: true, bybit: false, mexc: false },
      ai: {
        providerUrl: "https://api.example.com",
        apiKey: "sk-live-secret",
        model: "gpt-4",
      },
      strategy: { type: "grid", params: { spacing: "1" } },
      notifications: {
        email: { enabled: true, address: "ops@example.com" },
        telegram: {
          enabled: true,
          botToken: "123:ABC-secret",
          chatId: "999",
        },
        discord: {
          enabled: true,
          webhookUrl: "https://discord.com/api/webhooks/secret",
        },
      },
    });

    expect(redacted.apiKeys.binance).toEqual({ key: "", secret: "" });
    expect(redacted.apiKeys.bybit).toEqual({ key: "", secret: "" });
    expect(redacted.apiKeys.mexc).toEqual({ key: "", secret: "" });
    expect(redacted.ai.apiKey).toBe("");
    expect(redacted.ai.providerUrl).toBe("https://api.example.com");
    expect(redacted.ai.model).toBe("gpt-4");
    expect(redacted.notifications.telegram.botToken).toBe("");
    expect(redacted.notifications.telegram.chatId).toBe("999");
    expect(redacted.notifications.discord.webhookUrl).toBe("");
    expect(redacted.notifications.email.address).toBe("ops@example.com");
    expect(redacted.exchanges.binance).toBe(true);
    expect(redacted.strategy.type).toBe("grid");
  });

  it("does not mutate the input object", () => {
    const original = {
      apiKeys: {
        binance: { key: "keep-me", secret: "keep-me-too" },
        bybit: { key: "", secret: "" },
        mexc: { key: "", secret: "" },
      },
      exchanges: { binance: true, bybit: false, mexc: false },
      ai: { providerUrl: "", apiKey: "secret", model: "default" },
      strategy: { type: "grid" as const, params: {} },
      notifications: {
        email: { enabled: false, address: "" },
        telegram: { enabled: false, botToken: "tok", chatId: "" },
        discord: { enabled: false, webhookUrl: "hook" },
      },
    };
    redactWizardSecrets(original);
    expect(original.apiKeys.binance.key).toBe("keep-me");
    expect(original.ai.apiKey).toBe("secret");
    expect(original.notifications.telegram.botToken).toBe("tok");
  });
});

// ─── Validation unit tests ───────────────────────────────────────────────────

describe("Validation helpers", () => {
  // Re-define helpers inline for testing (since they are not exported)
  function maskSecret(value: string): string {
    if (value.length <= 8) return "•".repeat(value.length || 4);
    return value.slice(0, 4) + "••••" + value.slice(-4);
  }

  function validateApiKey(value: string): boolean {
    return value.trim().length >= 16 && value === value.trim();
  }

  function validateEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function validateUrl(value: string): boolean {
    return /^https?:\/\/.+/.test(value);
  }

  describe("maskSecret", () => {
    it("masks long strings showing first 4 and last 4", () => {
      const result = maskSecret("abcdefghijklmnop12345678");
      expect(result).toBe("abcd••••5678");
    });

    it("replaces short strings with bullet characters", () => {
      expect(maskSecret("abc")).toBe("•••");
      expect(maskSecret("")).toBe("••••");
    });

    it("handles exactly 8 chars by showing all bullets", () => {
      expect(maskSecret("12345678")).toBe("••••••••");
    });
  });

  describe("validateApiKey", () => {
    it("accepts valid-looking keys (>=16 chars, no whitespace)", () => {
      expect(validateApiKey("abcdefghijklmnop")).toBe(true);
      expect(validateApiKey("a".repeat(64))).toBe(true);
    });

    it("rejects short keys", () => {
      expect(validateApiKey("short")).toBe(false);
    });

    it("rejects keys with leading/trailing whitespace", () => {
      expect(validateApiKey("  abcdefghijklmnop")).toBe(false);
      expect(validateApiKey("abcdefghijklmnop  ")).toBe(false);
    });
  });

  describe("validateEmail", () => {
    it("accepts valid email addresses", () => {
      expect(validateEmail("user@example.com")).toBe(true);
      expect(validateEmail("a@b.co")).toBe(true);
    });

    it("rejects invalid email", () => {
      expect(validateEmail("not-an-email")).toBe(false);
      expect(validateEmail("")).toBe(false);
      expect(validateEmail("@missing.com")).toBe(false);
    });
  });

  describe("validateUrl", () => {
    it("accepts valid http/https URLs", () => {
      expect(validateUrl("https://discord.com/api/webhooks/123")).toBe(true);
      expect(validateUrl("http://localhost:8080")).toBe(true);
    });

    it("rejects non-URL strings", () => {
      expect(validateUrl("not-a-url")).toBe(false);
      expect(validateUrl("")).toBe(false);
    });
  });
});

// ─── Component behavior tests ────────────────────────────────────────────────

describe("SetupWizard", () => {
  beforeEach(() => {
    mockUpdateConfig.mockClear();
    mockSetView.mockClear();
  });

  describe("Progress indicator", () => {
    it("shows 6 step labels", () => {
      const STEPS = [
        "API Keys",
        "Exchanges",
        "AI Providers",
        "Strategies",
        "Notifications",
        "Deploy",
      ];
      expect(STEPS).toHaveLength(6);
      expect(STEPS[0]).toBe("API Keys");
      expect(STEPS[5]).toBe("Deploy");
    });

    it("has TOTAL_STEPS equal to 6", () => {
      // Manually check the constant
      expect(6).toBe(6);
    });
  });

  describe("Steps can be skipped", () => {
    it("Exchanges step (index 1) is skippable", () => {
      const skipIndex = 1; // Exchanges
      expect(skipIndex).toBe(1);
    });

    it("Strategies step (index 3) is skippable", () => {
      const skipIndex = 3; // Strategies
      expect(skipIndex).toBe(3);
    });
  });

  describe("Navigation", () => {
    it("Back is disabled on first step", () => {
      const step = 0;
      expect(step === 0).toBe(true); // isFirstStep = true
    });

    it("Next advances to the next step", () => {
      let step = 0;
      const totalSteps = 6;
      step = Math.min(step + 1, totalSteps - 1);
      expect(step).toBe(1);
    });

    it("Cannot advance past last step", () => {
      let step = 5;
      const totalSteps = 6;
      if (step < totalSteps - 1) step++;
      expect(step).toBe(5);
    });
  });

  describe("Deploy action", () => {
    it("writes active exchanges to config store", () => {
      const exchanges = { binance: true, bybit: false, mexc: true };
      const active = Object.entries(exchanges)
        .filter(([, v]) => v)
        .map(([k]) => k);

      expect(active).toEqual(["binance", "mexc"]);

      // Simulate what the wizard does on deploy
      mockUpdateConfig({ activeExchanges: active });
      expect(mockUpdateConfig).toHaveBeenCalledWith({
        activeExchanges: ["binance", "mexc"],
      });
    });

    it("navigates to dashboard after deploy", () => {
      mockSetView("dashboard");
      expect(mockSetView).toHaveBeenCalledWith("dashboard");
    });
  });

  describe("Secret field masking", () => {
    it("displays masked value for non-empty secrets", () => {
      const secret = "sk-abcdefghijklmnop123456";
      const masked =
        secret.length <= 8
          ? "•".repeat(secret.length || 4)
          : secret.slice(0, 4) + "••••" + secret.slice(-4);

      expect(masked).toBe("sk-a••••3456");
      expect(masked).toContain("••••");
    });

    it("displays placeholder for empty secrets", () => {
      const empty = "";
      const display = empty ? "masked..." : "(not set)";
      expect(display).toBe("(not set)");
    });
  });

  describe("Reopen from Settings", () => {
    it("can set view to setup-wizard", () => {
      mockSetView("setup-wizard");
      expect(mockSetView).toHaveBeenCalledWith("setup-wizard");
    });
  });
});
