/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from "bun:test";
import { EnvService } from "../../services/env/index.js";

describe("env command", () => {
  describe("EnvService integration", () => {
    it("validate catches missing required vars", () => {
      const result = EnvService.validate({});
      expect(result.missing.length).toBeGreaterThan(0);
      expect(result.missing).toContain("CLOUDFLARE_API_TOKEN");
    });

    it("validate passes with all required vars", () => {
      const vars: Record<string, string> = {
        CLOUDFLARE_API_TOKEN: "cfut_xxx",
        CLOUDFLARE_ACCOUNT_ID: "abc123",
        SUBDOMAIN_PREFIX: "myapp",
        TRADE_INTERNAL_KEY: "trade-key",
        AGENT_INTERNAL_KEY: "agent-key",
        WEBHOOK_API_KEY_BINDING: "webhook-key",
        INTERNAL_KEY_BINDING: "inter-key",
        API_SERVICE_KEY_BINDING: "api-key",
        TELEGRAM_INTERNAL_KEY_BINDING: "tg-key",
        DASHBOARD_USER: "admin",
        DASHBOARD_PASS: "pass123",
        SESSION_SECRET: "a".repeat(32),
      };
      const result = EnvService.validate(vars);
      expect(result.missing.length).toBe(0);
    });

    it("generateEnvLocal produces valid output", () => {
      const content = EnvService.generateEnvLocal();
      expect(content).toContain("CLOUDFLARE_API_TOKEN");
      expect(content).toContain("# NEVER commit this file");
    });

    it("show redacts secrets", () => {
      const output = EnvService.show({ CLOUDFLARE_API_TOKEN: "s3kr3t" });
      expect(output).toContain("********");
      expect(output).not.toContain("s3kr3t");
    });
  });
});
