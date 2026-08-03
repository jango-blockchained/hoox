/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for shared middleware
 * Run with: bun test packages/shared/test/middleware.test.ts
 */

import { describe, test, expect } from "bun:test";
import { createLogger, withRequestLog } from "../src/middleware/logger";
import {
  requireAuth,
  requireOperatorAuth,
  resolveOperatorApiKey,
  requireInternalAuth,
  checkInternalAuth,
} from "../src/middleware/auth";
import { z } from "zod";
import {
  validateJson,
  validateJsonLegacy,
  requireField,
  optionalField,
} from "../src/middleware/validate";
describe("Middleware", () => {
  describe("Logger", () => {
    test("should create logger instance", () => {
      const logger = createLogger({ service: "test", module: "logger" });
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.error).toBe("function");
    });

    test("withRequestLog should wrap handler", () => {
      const handler = async () => new Response("OK");
      const wrapped = withRequestLog(handler, { service: "test" });
      expect(typeof wrapped).toBe("function");
    });

    test("createLogger.info() should produce valid JSON when called", () => {
      const originalInfo = console.info;
      let captured = "";
      console.info = (msg: string) => {
        captured = msg;
      };
      try {
        const logger = createLogger({ service: "test", module: "logger" });
        logger.info("test message");
        const parsed = JSON.parse(captured);
        expect(parsed.level).toBe("info");
        expect(parsed.message).toBe("test message");
        expect(parsed.service).toBe("test");
      } finally {
        console.info = originalInfo;
      }
    });

    test("createLogger.warn() should produce valid JSON", () => {
      const originalWarn = console.warn;
      let captured = "";
      console.warn = (msg: string) => {
        captured = msg;
      };
      try {
        const logger = createLogger({ service: "test" });
        logger.warn("warning message");
        const parsed = JSON.parse(captured);
        expect(parsed.level).toBe("warn");
        expect(parsed.message).toBe("warning message");
      } finally {
        console.warn = originalWarn;
      }
    });

    test("createLogger.error() should produce valid JSON", () => {
      const originalError = console.error;
      let captured = "";
      console.error = (msg: string) => {
        captured = msg;
      };
      try {
        const logger = createLogger({ service: "test" });
        logger.error("error message");
        const parsed = JSON.parse(captured);
        expect(parsed.level).toBe("error");
        expect(parsed.message).toBe("error message");
      } finally {
        console.error = originalError;
      }
    });

    test("logger context object should appear in output", () => {
      const originalInfo = console.info;
      let captured = "";
      console.info = (msg: string) => {
        captured = msg;
      };
      try {
        const logger = createLogger({ service: "test" });
        logger.info("msg", { key: "val" });
        const parsed = JSON.parse(captured);
        expect(parsed.context).toBeDefined();
        expect(parsed.context.key).toBe("val");
      } finally {
        console.info = originalInfo;
      }
    });

    test("withRequestLog should call the wrapped handler", async () => {
      const handler = async () => new Response("OK", { status: 200 });
      const wrapped = withRequestLog(handler, { service: "test" });
      const req = new Request("http://localhost/test");
      const mockEnv = {};
      const mockCtx = { waitUntil: () => {} } as unknown as ExecutionContext;
      const response = await wrapped(req, mockEnv, mockCtx);
      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(200);
    });
  });

  describe("Auth", () => {
    test("should return null for valid auth", async () => {
      const env = { INTERNAL_API_KEY: "test-key" };
      const req = new Request("http://localhost/test", {
        headers: { Authorization: "Bearer test-key" },
      });
      const result = await requireAuth(req, env);
      expect(result).toBeNull();
    });

    test("should return 401 for missing auth", async () => {
      const env = { INTERNAL_API_KEY: "test-key" };
      const req = new Request("http://localhost/test");
      const result = await requireAuth(req, env);
      expect(result).not.toBeNull();
      expect(result?.status).toBe(401);
    });

    test("should return 401 for invalid auth", async () => {
      const env = { INTERNAL_API_KEY: "test-key" };
      const req = new Request("http://localhost/test", {
        headers: { Authorization: "Bearer wrong-key" },
      });
      const result = await requireAuth(req, env);
      expect(result).not.toBeNull();
      expect(result?.status).toBe(401);
    });

    test("prefer OPERATOR_API_KEY over INTERNAL_API_KEY", async () => {
      expect(
        resolveOperatorApiKey({
          OPERATOR_API_KEY: "op-key",
          INTERNAL_API_KEY: "legacy",
        })
      ).toBe("op-key");

      const env = {
        OPERATOR_API_KEY: "op-key",
        INTERNAL_API_KEY: "legacy",
      };
      const ok = await requireOperatorAuth(
        new Request("http://localhost/test", {
          headers: { Authorization: "Bearer op-key" },
        }),
        env
      );
      expect(ok).toBeNull();

      const denied = await requireOperatorAuth(
        new Request("http://localhost/test", {
          headers: { Authorization: "Bearer legacy" },
        }),
        env
      );
      expect(denied?.status).toBe(401);
    });

    test("fail-closed when no operator key configured", async () => {
      const result = await requireOperatorAuth(
        new Request("http://localhost/test", {
          headers: { Authorization: "Bearer anything" },
        }),
        {}
      );
      expect(result?.status).toBe(401);
      const body = (await result!.json()) as { error: string; hint?: string };
      expect(body.error).toContain("Operator API key not configured");
      expect(body.hint).toContain("OPERATOR_API_KEY");
    });

    test("requireInternalAuth should pass with correct header", () => {
      const env = { INTERNAL_KEY_BINDING: "secret-key" };
      const req = new Request("http://localhost/test", {
        headers: { "X-Internal-Auth-Key": "secret-key" },
      });
      const result = requireInternalAuth(req, env);
      expect(result).toBeNull();
    });

    test("requireInternalAuth should reject missing header", () => {
      const env = { INTERNAL_KEY_BINDING: "secret-key" };
      const req = new Request("http://localhost/test");
      const result = requireInternalAuth(req, env);
      expect(result).not.toBeNull();
      expect(result?.status).toBe(401);
    });

    test("checkInternalAuth should return true for matching key", () => {
      const env = { INTERNAL_KEY_BINDING: "secret-key" };
      const req = new Request("http://localhost/test", {
        headers: { "X-Internal-Auth-Key": "secret-key" },
      });
      const result = checkInternalAuth(req, env);
      expect(result.authorized).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe("Validation", () => {
    const testSchema = z.object({ key: z.string() }).strict();

    test("validateJson should parse valid data against schema", () => {
      const result = validateJson(testSchema, { key: "value" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.key).toBe("value");
      }
    });

    test("validateJson should reject invalid data", () => {
      const result = validateJson(testSchema, { key: 123 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("key");
      }
    });

    test("validateJsonLegacy should parse valid request JSON", async () => {
      const req = new Request("http://localhost/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "value" }),
      });
      const result = await validateJsonLegacy(req);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.key).toBe("value");
      }
    });

    test("requireField should return field value", () => {
      const body = { name: "test", value: 123 };
      const result = requireField<string>(body, "name");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("test");
      }
    });

    test("requireField should fail for missing field", () => {
      const body = { name: "test" };
      const result = requireField<string>(body, "missing");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Missing required field");
      }
    });

    test("optionalField should return value if present", () => {
      const body = { name: "test", count: 5 };
      const result = optionalField<number>(body, "count", 0);
      expect(result).toBe(5);
    });

    test("optionalField should return default if missing", () => {
      const body = { name: "test" };
      const result = optionalField<number>(body, "count", 10);
      expect(result).toBe(10);
    });

    test("validateJsonLegacy should reject invalid JSON body", async () => {
      const req = new Request("http://localhost/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      });
      const result = await validateJsonLegacy(req);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Invalid JSON");
      }
    });

    test("validateJson with nested schema should validate objects", () => {
      const nestedSchema = z
        .object({
          user: z
            .object({
              name: z.string(),
              age: z.number().int().positive(),
            })
            .strict(),
        })
        .strict();
      const valid = validateJson(nestedSchema, {
        user: { name: "Alice", age: 30 },
      });
      expect(valid.ok).toBe(true);
      if (valid.ok) {
        expect(valid.value.user.name).toBe("Alice");
      }
      const invalid = validateJson(nestedSchema, {
        user: { name: "Alice", age: "thirty" },
      });
      expect(invalid.ok).toBe(false);
    });

    test("validateJson with z.enum should reject invalid values", () => {
      const enumSchema = z
        .object({
          role: z.enum(["admin", "user", "viewer"]),
        })
        .strict();
      const valid = validateJson(enumSchema, { role: "admin" });
      expect(valid.ok).toBe(true);
      const invalid = validateJson(enumSchema, { role: "superadmin" });
      expect(invalid.ok).toBe(false);
      if (!invalid.ok) {
        expect(invalid.error).toContain("role");
      }
    });
  });
});
