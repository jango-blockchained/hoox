/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test";
import { healthCheck } from "../../src/health";

type ResponseBody = Record<string, unknown>;

describe("healthCheck", () => {
  describe("Basic Health Check", () => {
    it("returns 200 status", async () => {
      const response = healthCheck();
      expect(response.status).toBe(200);
    });

    it("returns JSON response", async () => {
      const response = healthCheck();
      expect(response.headers.get("Content-Type")).toBe("application/json");
    });

    it("includes success: true", async () => {
      const response = healthCheck();
      const body = (await response.json()) as ResponseBody;
      expect(body.success).toBe(true);
    });

    it("includes result object", async () => {
      const response = healthCheck();
      const body = (await response.json()) as ResponseBody;
      expect(body).toHaveProperty("result");
      expect(typeof body.result).toBe("object");
    });

    it("result includes status field", async () => {
      const response = healthCheck();
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result).toHaveProperty("status");
      expect(result.status).toBe("ok");
    });

    it("result includes timestamp", async () => {
      const response = healthCheck();
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result).toHaveProperty("timestamp");
      expect(typeof result.timestamp).toBe("string");
    });

    it("timestamp is valid ISO string", async () => {
      const response = healthCheck();
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      const timestamp = result.timestamp as string;
      expect(() => new Date(timestamp)).not.toThrow();
      expect(new Date(timestamp).toISOString()).toBe(timestamp);
    });

    it("timestamp is recent", async () => {
      const before = new Date();
      const response = healthCheck();
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      const after = new Date();

      const timestamp = new Date(result.timestamp as string);
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(
        before.getTime() - 100
      );
      expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime() + 100);
    });

    it("response is valid JSON", async () => {
      const response = healthCheck();
      expect(() => response.json()).not.toThrow();
    });

    it("response can be stringified", async () => {
      const response = healthCheck();
      const body = (await response.json()) as ResponseBody;
      const stringified = JSON.stringify(body);
      expect(typeof stringified).toBe("string");
      expect(stringified.length).toBeGreaterThan(0);
    });
  });

  describe("Health Check with Options", () => {
    it("accepts worker option", async () => {
      const response = healthCheck({ worker: "api-service" });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result.service).toBe("api-service");
    });

    it("includes version if provided", async () => {
      const response = healthCheck({ version: "1.2.3" });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result.version).toBe("1.2.3");
    });

    it("includes details if provided", async () => {
      const details = { database: "connected", cache: "ready" };
      const response = healthCheck({ details });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result.details).toEqual(details);
    });

    it("includes multiple options together", async () => {
      const details = { uptime: 3600 };
      const response = healthCheck({
        worker: "api-service",
        version: "1.0.0",
        details,
      });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result.service).toBe("api-service");
      expect(result.version).toBe("1.0.0");
      expect(result.details).toEqual(details);
    });

    it("merges custom headers with default headers", async () => {
      const response = healthCheck();
      expect(response.headers.get("Content-Type")).toBe("application/json");
    });

    it("handles empty options object", async () => {
      const response = healthCheck({});
      expect(response.status).toBe(200);
      const body = (await response.json()) as ResponseBody;
      expect(body.success).toBe(true);
    });

    it("handles null worker option", async () => {
      const response = healthCheck({ worker: null as any });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result).not.toHaveProperty("service");
    });

    it("handles null version option", async () => {
      const response = healthCheck({ version: null as any });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result).not.toHaveProperty("version");
    });

    it("handles null details option", async () => {
      const response = healthCheck({ details: null as any });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result).not.toHaveProperty("details");
    });

    it("handles undefined options", async () => {
      const response = healthCheck(undefined);
      expect(response.status).toBe(200);
      const body = (await response.json()) as ResponseBody;
      expect(body.success).toBe(true);
    });
  });

  describe("Health Check with Details", () => {
    it("includes details array if provided", async () => {
      const details = {
        database: "ok",
        cache: "ok",
      };
      const response = healthCheck({ details });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result.details).toEqual(details);
    });

    it("includes complex details object", async () => {
      const details = {
        database: {
          status: "ok",
          responseTime: 10,
        },
        cache: {
          status: "ok",
          responseTime: 5,
        },
      };
      const response = healthCheck({ details });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result.details).toEqual(details);
    });

    it("includes error information in details", async () => {
      const details = {
        database: {
          status: "failed",
          error: "Connection timeout",
        },
      };
      const response = healthCheck({ details });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect((result.details as ResponseBody).database).toHaveProperty("error");
    });

    it("includes nested details", async () => {
      const details = {
        services: {
          api: { status: "ok" },
          db: { status: "ok" },
          cache: { status: "degraded" },
        },
      };
      const response = healthCheck({ details });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result.details).toEqual(details);
    });

    it("handles empty details object", async () => {
      const response = healthCheck({ details: {} });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result.details).toEqual({});
    });

    it("handles details with null values", async () => {
      const details = {
        database: null,
        cache: "ok",
      };
      const response = healthCheck({ details });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect((result.details as ResponseBody).database).toBeNull();
    });

    it("handles details with array values", async () => {
      const details = {
        services: ["api", "db", "cache"],
      };
      const response = healthCheck({ details });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect((result.details as ResponseBody).services).toEqual([
        "api",
        "db",
        "cache",
      ]);
    });
  });

  describe("Health Check Edge Cases", () => {
    it("handles no options", async () => {
      const response = healthCheck();
      expect(response.status).toBe(200);
      const body = (await response.json()) as ResponseBody;
      expect(body.success).toBe(true);
    });

    it("handles very long worker name", async () => {
      const longName = "x".repeat(10000);
      const response = healthCheck({ worker: longName });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result.service).toBe(longName);
    });

    it("handles very long version string", async () => {
      const longVersion = "1.0.0-" + "x".repeat(10000);
      const response = healthCheck({ version: longVersion });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result.version).toBe(longVersion);
    });

    it("handles special characters in worker name", async () => {
      const response = healthCheck({
        worker: "api <script>alert('xss')</script>",
      });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result.service).toBeDefined();
    });

    it("handles unicode characters in worker name", async () => {
      const response = healthCheck({ worker: "api 🚀 ✅ 你好" });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result.service).toBe("api 🚀 ✅ 你好");
    });

    it("handles unicode characters in version", async () => {
      const response = healthCheck({ version: "1.0.0 🚀 ✅" });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result.version).toBe("1.0.0 🚀 ✅");
    });

    it("handles multiple calls in sequence", async () => {
      const response1 = healthCheck();
      const response2 = healthCheck();
      const response3 = healthCheck();

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(response3.status).toBe(200);

      const body1 = (await response1.json()) as ResponseBody;
      const body2 = (await response2.json()) as ResponseBody;
      const body3 = (await response3.json()) as ResponseBody;

      expect(body1.success).toBe(true);
      expect(body2.success).toBe(true);
      expect(body3.success).toBe(true);
    });

    it("handles concurrent calls", async () => {
      const promises = [healthCheck(), healthCheck(), healthCheck()];

      const responses = await Promise.all(promises);
      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });

      const bodies = await Promise.all(responses.map((r) => r.json()));
      bodies.forEach((body) => {
        expect((body as ResponseBody).success).toBe(true);
      });
    });

    it("handles large details object", async () => {
      const largeDetails: Record<string, unknown> = {};
      for (let i = 0; i < 1000; i++) {
        largeDetails[`service_${i}`] = {
          status: "ok",
          responseTime: Math.random() * 100,
        };
      }
      const response = healthCheck({ details: largeDetails });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(Object.keys(result.details as ResponseBody).length).toBe(1000);
    });

    it("handles deeply nested details", async () => {
      let nested: any = { value: "deep" };
      for (let i = 0; i < 100; i++) {
        nested = { level: nested };
      }
      const response = healthCheck({ details: nested });
      const body = (await response.json()) as ResponseBody;
      expect(body.success).toBe(true);
    });
  });

  describe("Health Check Response Format", () => {
    it("response is valid JSON", async () => {
      const response = healthCheck();
      const body = (await response.json()) as ResponseBody;
      expect(body).toBeDefined();
    });

    it("response can be stringified and parsed", async () => {
      const response = healthCheck();
      const body = (await response.json()) as ResponseBody;
      const stringified = JSON.stringify(body);
      const parsed = JSON.parse(stringified);
      expect(parsed.success).toBe(true);
    });

    it("response structure is consistent", async () => {
      const response1 = healthCheck();
      const response2 = healthCheck();

      const body1 = (await response1.json()) as ResponseBody;
      const body2 = (await response2.json()) as ResponseBody;

      expect(Object.keys(body1).sort()).toEqual(Object.keys(body2).sort());
    });

    it("includes required fields", async () => {
      const response = healthCheck();
      const body = (await response.json()) as ResponseBody;

      expect(body).toHaveProperty("success");
      expect(body).toHaveProperty("result");
    });

    it("result includes required fields", async () => {
      const response = healthCheck();
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;

      expect(result).toHaveProperty("status");
      expect(result).toHaveProperty("timestamp");
    });

    it("Content-Type header is correct", async () => {
      const response = healthCheck();
      expect(response.headers.get("Content-Type")).toBe("application/json");
    });

    it("response headers are readable", async () => {
      const response = healthCheck();
      expect(response.headers.get("Content-Type")).toBeDefined();
    });

    it("status is always 200", async () => {
      const responses = [
        healthCheck(),
        healthCheck({ worker: "test" }),
        healthCheck({ version: "1.0.0" }),
        healthCheck({ details: { test: "data" } }),
      ];

      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });
    });

    it("success is always true", async () => {
      const responses = [
        healthCheck(),
        healthCheck({ worker: "test" }),
        healthCheck({ version: "1.0.0" }),
        healthCheck({ details: { test: "data" } }),
      ];

      responses.forEach(async (response) => {
        const body = (await response.json()) as ResponseBody;
        expect(body.success).toBe(true);
      });
    });

    it("status field is always 'ok'", async () => {
      const responses = [
        healthCheck(),
        healthCheck({ worker: "test" }),
        healthCheck({ version: "1.0.0" }),
        healthCheck({ details: { test: "data" } }),
      ];

      responses.forEach(async (response) => {
        const body = (await response.json()) as ResponseBody;
        const result = body.result as ResponseBody;
        expect(result.status).toBe("ok");
      });
    });
  });

  describe("Health Check Status Codes", () => {
    it("returns 200 for basic health check", async () => {
      const response = healthCheck();
      expect(response.status).toBe(200);
    });

    it("returns 200 with worker option", async () => {
      const response = healthCheck({ worker: "api" });
      expect(response.status).toBe(200);
    });

    it("returns 200 with version option", async () => {
      const response = healthCheck({ version: "1.0.0" });
      expect(response.status).toBe(200);
    });

    it("returns 200 with details option", async () => {
      const response = healthCheck({ details: { test: "data" } });
      expect(response.status).toBe(200);
    });

    it("returns 200 with all options", async () => {
      const response = healthCheck({
        worker: "api",
        version: "1.0.0",
        details: { test: "data" },
      });
      expect(response.status).toBe(200);
    });
  });

  describe("Health Check Worker/Service Field", () => {
    it("includes service field when worker is provided", async () => {
      const response = healthCheck({ worker: "api-service" });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result).toHaveProperty("service");
    });

    it("does not include service field when worker is not provided", async () => {
      const response = healthCheck();
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result).not.toHaveProperty("service");
    });

    it("service field contains worker value", async () => {
      const response = healthCheck({ worker: "my-service" });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result.service).toBe("my-service");
    });

    it("handles empty string worker", async () => {
      const response = healthCheck({ worker: "" });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result.service).toBe("");
    });

    it("handles whitespace-only worker", async () => {
      const response = healthCheck({ worker: "   " });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result.service).toBe("   ");
    });
  });

  describe("Health Check Version Field", () => {
    it("includes version field when version is provided", async () => {
      const response = healthCheck({ version: "1.2.3" });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result).toHaveProperty("version");
    });

    it("does not include version field when version is not provided", async () => {
      const response = healthCheck();
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result).not.toHaveProperty("version");
    });

    it("version field contains version value", async () => {
      const response = healthCheck({ version: "2.0.0" });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result.version).toBe("2.0.0");
    });

    it("handles semantic version", async () => {
      const response = healthCheck({ version: "1.2.3-beta.1+build.123" });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result.version).toBe("1.2.3-beta.1+build.123");
    });

    it("handles empty string version", async () => {
      const response = healthCheck({ version: "" });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result.version).toBe("");
    });
  });

  describe("Health Check Details Field", () => {
    it("includes details field when details is provided", async () => {
      const response = healthCheck({ details: { test: "data" } });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result).toHaveProperty("details");
    });

    it("does not include details field when details is not provided", async () => {
      const response = healthCheck();
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result).not.toHaveProperty("details");
    });

    it("details field contains details value", async () => {
      const details = { database: "ok", cache: "ok" };
      const response = healthCheck({ details });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result.details).toEqual(details);
    });

    it("handles empty details object", async () => {
      const response = healthCheck({ details: {} });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(result.details).toEqual({});
    });

    it("handles details with multiple properties", async () => {
      const details = {
        database: "connected",
        cache: "ready",
        queue: "processing",
        storage: "available",
      };
      const response = healthCheck({ details });
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      expect(Object.keys(result.details as ResponseBody).length).toBe(4);
    });
  });

  describe("Health Check Timestamp Field", () => {
    it("timestamp is always present", async () => {
      const responses = [
        healthCheck(),
        healthCheck({ worker: "test" }),
        healthCheck({ version: "1.0.0" }),
        healthCheck({ details: { test: "data" } }),
      ];

      responses.forEach(async (response) => {
        const body = (await response.json()) as ResponseBody;
        const result = body.result as ResponseBody;
        expect(result).toHaveProperty("timestamp");
      });
    });

    it("timestamp is ISO 8601 format", async () => {
      const response = healthCheck();
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      const timestamp = result.timestamp as string;
      expect(timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
    });

    it("timestamp is parseable as Date", async () => {
      const response = healthCheck();
      const body = (await response.json()) as ResponseBody;
      const result = body.result as ResponseBody;
      const timestamp = result.timestamp as string;
      const date = new Date(timestamp);
      expect(date instanceof Date).toBe(true);
      expect(isNaN(date.getTime())).toBe(false);
    });

    it("multiple calls have different timestamps", async () => {
      const response1 = healthCheck();
      await new Promise((resolve) => setTimeout(resolve, 10));
      const response2 = healthCheck();

      const body1 = (await response1.json()) as ResponseBody;
      const body2 = (await response2.json()) as ResponseBody;

      const timestamp1 = (body1.result as ResponseBody).timestamp as string;
      const timestamp2 = (body2.result as ResponseBody).timestamp as string;

      expect(timestamp1).not.toBe(timestamp2);
    });
  });

  describe("Health Check Response Consistency", () => {
    it("all responses have success: true", async () => {
      const responses = [
        healthCheck(),
        healthCheck({ worker: "test" }),
        healthCheck({ version: "1.0.0" }),
        healthCheck({ details: { test: "data" } }),
      ];

      responses.forEach(async (response) => {
        const body = (await response.json()) as ResponseBody;
        expect(body.success).toBe(true);
      });
    });

    it("all responses have result object", async () => {
      const responses = [
        healthCheck(),
        healthCheck({ worker: "test" }),
        healthCheck({ version: "1.0.0" }),
        healthCheck({ details: { test: "data" } }),
      ];

      responses.forEach(async (response) => {
        const body = (await response.json()) as ResponseBody;
        expect(body).toHaveProperty("result");
        expect(typeof body.result).toBe("object");
      });
    });

    it("all responses have status: ok", async () => {
      const responses = [
        healthCheck(),
        healthCheck({ worker: "test" }),
        healthCheck({ version: "1.0.0" }),
        healthCheck({ details: { test: "data" } }),
      ];

      responses.forEach(async (response) => {
        const body = (await response.json()) as ResponseBody;
        const result = body.result as ResponseBody;
        expect(result.status).toBe("ok");
      });
    });

    it("all responses have timestamp", async () => {
      const responses = [
        healthCheck(),
        healthCheck({ worker: "test" }),
        healthCheck({ version: "1.0.0" }),
        healthCheck({ details: { test: "data" } }),
      ];

      responses.forEach(async (response) => {
        const body = (await response.json()) as ResponseBody;
        const result = body.result as ResponseBody;
        expect(result).toHaveProperty("timestamp");
      });
    });

    it("all responses have 200 status code", async () => {
      const responses = [
        healthCheck(),
        healthCheck({ worker: "test" }),
        healthCheck({ version: "1.0.0" }),
        healthCheck({ details: { test: "data" } }),
      ];

      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });
    });

    it("all responses have Content-Type: application/json", async () => {
      const responses = [
        healthCheck(),
        healthCheck({ worker: "test" }),
        healthCheck({ version: "1.0.0" }),
        healthCheck({ details: { test: "data" } }),
      ];

      responses.forEach((response) => {
        expect(response.headers.get("Content-Type")).toBe("application/json");
      });
    });
  });
});
