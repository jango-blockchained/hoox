/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from "bun:test";
import { EnvService } from "./env-service.js";

describe("EnvService", () => {
  describe("getDefinitions", () => {
    it("returns all known env var definitions", () => {
      const defs = EnvService.getDefinitions();
      expect(defs.length).toBe(27);
      expect(defs.some((d) => d.name === "CLOUDFLARE_API_TOKEN")).toBe(true);
    });

    it("each definition has required fields", () => {
      for (const def of EnvService.getDefinitions()) {
        expect(def.name).toBeTruthy();
        expect(typeof def.required).toBe("boolean");
        expect(typeof def.secret).toBe("boolean");
        expect(def.section).toBeTruthy();
      }
    });

    it("internal auth keys have autoGenerate flag", () => {
      const defs = EnvService.getDefinitions();
      const autoGenDefs = defs.filter((d) => d.autoGenerate);
      expect(autoGenDefs.length).toBeGreaterThanOrEqual(6);
      const autoGenNames = autoGenDefs.map((d) => d.name);
      expect(autoGenNames).toContain("TRADE_INTERNAL_KEY");
      expect(autoGenNames).toContain("AGENT_INTERNAL_KEY");
      expect(autoGenNames).toContain("WEBHOOK_API_KEY_BINDING");
      expect(autoGenNames).toContain("INTERNAL_KEY_BINDING");
      expect(autoGenNames).toContain("API_SERVICE_KEY_BINDING");
      expect(autoGenNames).toContain("TELEGRAM_INTERNAL_KEY_BINDING");
      expect(autoGenNames).toContain("SESSION_SECRET");
    });
  });

  describe("getSections", () => {
    it("returns unique sections in order", () => {
      const sections = EnvService.getSections();
      expect(sections.length).toBeGreaterThanOrEqual(7);
      expect(sections[0]).toBe("Cloudflare Account");
    });
  });

  describe("generateEnvLocal", () => {
    it("generates template with all vars", () => {
      const content = EnvService.generateEnvLocal();
      expect(content).toContain("CLOUDFLARE_API_TOKEN");
      expect(content).toContain("NEVER commit this file");
    });

    it("includes provided values", () => {
      const content = EnvService.generateEnvLocal({
        SUBDOMAIN_PREFIX: "myapp",
      });
      expect(content).toContain('SUBDOMAIN_PREFIX="myapp"');
    });

    it("uses defaults for missing vars", () => {
      const content = EnvService.generateEnvLocal({});
      expect(content).toContain('SUBDOMAIN_PREFIX="cryptolinx"');
    });
  });

  describe("getWorkerDevVars", () => {
    it("maps vars to correct workers", () => {
      const vars = {
        AGENT_INTERNAL_KEY: "sk-123",
        TG_BOT_TOKEN_BINDING: "tg-456",
        INTERNAL_KEY_BINDING: "d1-789",
        DASHBOARD_USER: "admin",
        DASHBOARD_PASS: "pass",
        TELEGRAM_INTERNAL_KEY_BINDING: "tg-int-key",
      };
      const result = EnvService.getWorkerDevVars(vars);
      expect(result["workers/agent-worker"]).toBeDefined();
      expect(result["workers/agent-worker"].AGENT_INTERNAL_KEY).toBe("sk-123");
      expect(result["workers/telegram-worker"]).toBeDefined();
      expect(result["workers/telegram-worker"].TG_BOT_TOKEN_BINDING).toBe(
        "tg-456"
      );
      expect(result["workers/dashboard"]).toBeDefined();
      expect(result["workers/dashboard"].DASHBOARD_USER).toBe("admin");
      expect(result["workers/dashboard"].DASHBOARD_PASS).toBe("pass");
      expect(result["workers/dashboard"].TELEGRAM_INTERNAL_KEY_BINDING).toBe(
        "tg-int-key"
      );
    });

    it("omits workers with no matching vars", () => {
      const result = EnvService.getWorkerDevVars({});
      expect(Object.keys(result).length).toBe(0);
    });

    it("omits empty-string vars", () => {
      const result = EnvService.getWorkerDevVars({ INTERNAL_KEY_BINDING: "" });
      expect(Object.keys(result).length).toBe(0);
    });

    it("maps all newly added vars to correct workers", () => {
      const vars = {
        AGENT_INTERNAL_KEY: "sk-123",
        WEBHOOK_API_KEY_BINDING: "webhook-key",
        HA_TOKEN_BINDING: "ha-token",
        API_SERVICE_KEY_BINDING: "api-key",
        TELEGRAM_SECRET_TOKEN: "tg-secret",
        WALLET_MNEMONIC_SECRET: "mnemonic",
        WALLET_PK_SECRET: "pk",
        EMAIL_HOST_BINDING: "imap.example.com",
        EMAIL_USER_BINDING: "user",
        EMAIL_PASS_BINDING: "pass",
        INTERNAL_KEY_BINDING: "int-key",
        DASHBOARD_USER: "admin",
        DASHBOARD_PASS: "pass",
        SESSION_SECRET: "secret-32-char-min-for-session",
        TELEGRAM_INTERNAL_KEY_BINDING: "tg-int-key",
      };
      const result = EnvService.getWorkerDevVars(vars);
      expect(result["workers/agent-worker"]).toBeDefined();
      expect(result["workers/agent-worker"].AGENT_INTERNAL_KEY).toBe("sk-123");
      expect(result["workers/dashboard"]).toBeDefined();
      expect(result["workers/dashboard"].DASHBOARD_USER).toBe("admin");
      expect(result["workers/dashboard"].DASHBOARD_PASS).toBe("pass");
      expect(result["workers/dashboard"].TELEGRAM_INTERNAL_KEY_BINDING).toBe(
        "tg-int-key"
      );
      expect(result["workers/hoox-worker"].HA_TOKEN_BINDING).toBe("ha-token");
      expect(result["workers/trade-worker"].API_SERVICE_KEY_BINDING).toBe(
        "api-key"
      );
      expect(result["workers/telegram-worker"].TELEGRAM_SECRET_TOKEN).toBe(
        "tg-secret"
      );
      expect(result["workers/web3-wallet-worker"]).toBeDefined();
      expect(result["workers/web3-wallet-worker"].WALLET_MNEMONIC_SECRET).toBe(
        "mnemonic"
      );
      expect(result["workers/email-worker"]).toBeDefined();
      expect(result["workers/email-worker"].EMAIL_HOST_BINDING).toBe(
        "imap.example.com"
      );
      expect(result["workers/dashboard"]).toBeDefined();
      expect(result["workers/dashboard"].DASHBOARD_USER).toBe("admin");
      expect(result["workers/dashboard"].DASHBOARD_PASS).toBe("pass");
      expect(result["workers/dashboard"].SESSION_SECRET).toBe(
        "secret-32-char-min-for-session"
      );
      expect(result["workers/dashboard"].TELEGRAM_INTERNAL_KEY_BINDING).toBe(
        "tg-int-key"
      );
    });
  });

  describe("validate", () => {
    it("flags missing required vars", () => {
      const result = EnvService.validate({});
      expect(result.missing.length).toBeGreaterThan(0);
      expect(result.missing).toContain("CLOUDFLARE_API_TOKEN");
    });

    it("flags 'your_' placeholder values as missing", () => {
      const result = EnvService.validate({
        CLOUDFLARE_API_TOKEN: "your_cloudflare_api_token",
      });
      expect(result.missing).toContain("CLOUDFLARE_API_TOKEN");
    });

    it("flags 'generate_' placeholder values as missing", () => {
      const result = EnvService.validate({
        SESSION_SECRET: "generate_a_32_character_secure_random_string",
      });
      expect(result.missing).toContain("SESSION_SECRET");
    });

    it("passes when all required vars are set with real values", () => {
      const vars: Record<string, string> = {
        CLOUDFLARE_API_TOKEN: "cfut_xxx",
        CLOUDFLARE_ACCOUNT_ID: "abc123",
        SUBDOMAIN_PREFIX: "myapp",
        TRADE_INTERNAL_KEY: "trade-key",
        AGENT_INTERNAL_KEY: "agent-key",
        WEBHOOK_API_KEY_BINDING: "webhook-key",
        INTERNAL_KEY_BINDING: "int-key",
        API_SERVICE_KEY_BINDING: "api-key",
        TELEGRAM_INTERNAL_KEY_BINDING: "tg-key",
        DASHBOARD_USER: "admin",
        DASHBOARD_PASS: "pass123",
        SESSION_SECRET: "a".repeat(32),
      };
      const result = EnvService.validate(vars);
      expect(result.missing.length).toBe(0);
    });

    it("warns on short session secret", () => {
      const vars: Record<string, string> = {
        CLOUDFLARE_API_TOKEN: "tok",
        CLOUDFLARE_ACCOUNT_ID: "id",
        SUBDOMAIN_PREFIX: "p",
        TRADE_INTERNAL_KEY: "k",
        AGENT_INTERNAL_KEY: "k",
        WEBHOOK_API_KEY_BINDING: "wk",
        INTERNAL_KEY_BINDING: "ik",
        API_SERVICE_KEY_BINDING: "ak",
        DASHBOARD_USER: "u",
        DASHBOARD_PASS: "p",
        SESSION_SECRET: "short",
      };
      const result = EnvService.validate(vars);
      expect(result.warnings).toContain(
        "SESSION_SECRET should be at least 32 characters"
      );
    });
  });

  describe("generateKey", () => {
    it("generates a hex string of the correct length", () => {
      const key32 = EnvService.generateKey(32);
      expect(key32.length).toBe(64);
      expect(/^[0-9a-f]+$/.test(key32)).toBe(true);
    });

    it("generates different keys each time", () => {
      const key1 = EnvService.generateKey();
      const key2 = EnvService.generateKey();
      expect(key1).not.toBe(key2);
    });

    it("generates custom byte length", () => {
      const key16 = EnvService.generateKey(16);
      expect(key16.length).toBe(32);
    });
  });

  describe("show", () => {
    it("redacts secrets", () => {
      const output = EnvService.show({ CLOUDFLARE_API_TOKEN: "secret123" });
      expect(output).toContain("********");
      expect(output).not.toContain("secret123");
    });

    it("shows non-secrets in plain text", () => {
      const output = EnvService.show({ SUBDOMAIN_PREFIX: "myapp" });
      expect(output).toContain("myapp");
    });
  });

  describe("loadDotEnvAsync", () => {
    it("returns empty object for missing file", async () => {
      const result = await EnvService.loadDotEnvAsync(
        "/tmp/nonexistent-file-12345.env"
      );
      expect(Object.keys(result).length).toBe(0);
    });

    it("parses simple key=value lines", async () => {
      const filePath = "/tmp/test-simple-12345.env";
      await Bun.write(filePath, "KEY=value\nFOO=bar\n");
      const result = await EnvService.loadDotEnvAsync(filePath);
      expect(result.KEY).toBe("value");
      expect(result.FOO).toBe("bar");
      await Bun.write(filePath, ""); // cleanup
    });

    it("strips double quotes from values", async () => {
      const filePath = "/tmp/test-quotes-12345.env";
      await Bun.write(
        filePath,
        'KEY="quoted value"\nNESTED="val with \\"quote\\""\n'
      );
      const result = await EnvService.loadDotEnvAsync(filePath);
      // First quote-stripped value
      expect(result.KEY).toBe("quoted value");
      await Bun.write(filePath, "");
    });

    it("skips comments and blank lines", async () => {
      const filePath = "/tmp/test-comments-12345.env";
      await Bun.write(
        filePath,
        "# this is a comment\n\nKEY=val\n# another comment\nFOO=bar\n"
      );
      const result = await EnvService.loadDotEnvAsync(filePath);
      expect(result.KEY).toBe("val");
      expect(result.FOO).toBe("bar");
      expect(Object.keys(result).length).toBe(2);
      await Bun.write(filePath, "");
    });

    it("handles empty values", async () => {
      const filePath = "/tmp/test-empty-12345.env";
      await Bun.write(filePath, "EMPTY=\nKEY=val\n");
      const result = await EnvService.loadDotEnvAsync(filePath);
      expect(result.EMPTY).toBe("");
      expect(result.KEY).toBe("val");
      await Bun.write(filePath, "");
    });
  });
});
