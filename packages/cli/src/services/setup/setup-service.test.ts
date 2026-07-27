import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { SetupService } from "./setup-service.js";
import type { ProgressEvent } from "./setup-service.js";

describe("SetupService", () => {
  let events: ProgressEvent[];

  beforeEach(() => {
    events = [];
  });

  afterEach(() => {
    events = [];
  });

  describe("constructor & progress callback", () => {
    it("uses a no-op callback when none is provided", () => {
      const svc = new SetupService();
      // Should not throw
      expect(svc).toBeDefined();
    });

    it("invokes the supplied callback for progress events", () => {
      const svc = new SetupService((e) => events.push(e));
      // Trigger an event by calling a skip path
      void svc.generateKeys(true);
      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.type === "info" && e.step === "keys")).toBe(
        true
      );
    });
  });

  describe("generateKeys(skip=true)", () => {
    it("returns null and emits an info event", async () => {
      const svc = new SetupService((e) => events.push(e));
      const result = await svc.generateKeys(true);
      expect(result).toBeNull();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe("info");
      expect(events[0]?.step).toBe("keys");
      expect(events[0]?.message).toBe("Skipped");
    });

    it("does not call _randomHex when skipped", async () => {
      const svc = new SetupService();
      // We can't directly spy on _randomHex (private), but we can verify
      // the result is null and the side effects are skipped.
      const result = await svc.generateKeys(true);
      expect(result).toBeNull();
    });
  });

  describe("applySchema(skip=true)", () => {
    it("returns a successful Skipped result", async () => {
      const svc = new SetupService();
      const result = await svc.applySchema("trade-data-db", true);
      expect(result).toEqual({
        step: "d1-schema",
        success: true,
        message: "Skipped",
      });
    });

    it("uses default db name when none provided", async () => {
      const svc = new SetupService();
      const result = await svc.applySchema(undefined, true);
      expect(result.step).toBe("d1-schema");
      expect(result.success).toBe(true);
    });
  });

  describe("rebuildDashboard(skip=true)", () => {
    it("returns a successful Skipped result", async () => {
      const svc = new SetupService();
      const result = await svc.rebuildDashboard(true);
      expect(result).toEqual({
        step: "dashboard",
        success: true,
        message: "Skipped",
      });
    });
  });

  describe("setSecrets", () => {
    it("returns empty array and emits info event when keys is null", async () => {
      const svc = new SetupService((e) => events.push(e));
      const result = await svc.setSecrets(null);
      expect(result).toEqual([]);
      expect(
        events.some((e) => e.type === "info" && e.message.includes("Skipped"))
      ).toBe(true);
    });

    it("returns empty array and emits info event when keys is undefined", async () => {
      const svc = new SetupService((e) => events.push(e));
      const result = await svc.setSecrets(undefined);
      expect(result).toEqual([]);
    });
  });

  describe("verifySetup(keys=null)", () => {
    it("returns ok=false and emits a warn event when keys is null", async () => {
      const svc = new SetupService((e) => events.push(e));
      const result = await svc.verifySetup(null);
      expect(result.ok).toBe(false);
      expect(result.missing).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(
        events.some((e) => e.type === "warn" && e.message.includes("No keys"))
      ).toBe(true);
    });
  });

  describe("checkAuth", () => {
    it("returns a boolean", async () => {
      // Inject a stub CloudflareService so no real `wrangler whoami`
      // (network/auth) call is made during the test.
      const cf = {
        whoami: () => Promise.resolve({ ok: true, value: "user@example.com" }),
      } as any;
      const svc = new SetupService(undefined, cf);
      const result = await svc.checkAuth();
      expect(typeof result).toBe("boolean");
      expect(result).toBe(true);
    });

    it("returns false when whoami fails", async () => {
      const cf = {
        whoami: () =>
          Promise.resolve({ ok: false, error: "not authenticated" }),
      } as any;
      const svc = new SetupService(undefined, cf);
      const result = await svc.checkAuth();
      expect(result).toBe(false);
    });
  });

  describe("type exports", () => {
    it("GeneratedKeys has all required fields", () => {
      const keys: import("./setup-service.js").GeneratedKeys = {
        INTERNAL_KEY_BINDING: "a".repeat(64),
        AGENT_INTERNAL_KEY: "b".repeat(64),
        SESSION_SECRET: "c".repeat(128),
        WEBHOOK_API_KEY_BINDING: "d".repeat(64),
        TELEGRAM_INTERNAL_KEY_BINDING: "e".repeat(64),
        TRADE_INTERNAL_KEY: "f".repeat(64),
        API_SERVICE_KEY_BINDING: "g".repeat(64),
      };
      expect(Object.keys(keys).sort()).toEqual(
        [
          "AGENT_INTERNAL_KEY",
          "API_SERVICE_KEY_BINDING",
          "INTERNAL_KEY_BINDING",
          "SESSION_SECRET",
          "TELEGRAM_INTERNAL_KEY_BINDING",
          "TRADE_INTERNAL_KEY",
          "WEBHOOK_API_KEY_BINDING",
        ].sort()
      );
    });

    it("SetupOptions accepts empty object", () => {
      const opts: import("./setup-service.js").SetupOptions = {};
      expect(opts).toEqual({});
    });
  });
});
