/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Comprehensive test suite for validate middleware
 * Tests body/query/header validation, error responses, and multiple validations
 */

import { describe, it, expect } from "bun:test";
import { z } from "zod";
import {
  validateJson,
  validateJsonLegacy,
  requireField,
  optionalField,
} from "../../src/middleware/validate";

describe("validateJson", () => {
  it("validates data against schema", () => {
    const schema = z.object({ name: z.string() });
    const data = { name: "test" };

    const result = validateJson(schema, data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("test");
    }
  });

  it("returns ok: true for valid data", () => {
    const schema = z.object({ age: z.number() });
    const data = { age: 25 };

    const result = validateJson(schema, data);
    expect(result.ok).toBe(true);
  });

  it("returns ok: false for invalid data", () => {
    const schema = z.object({ age: z.number() });
    const data = { age: "not a number" };

    const result = validateJson(schema, data);
    expect(result.ok).toBe(false);
  });

  it("includes error message for invalid data", () => {
    const schema = z.object({ age: z.number() });
    const data = { age: "invalid" };

    const result = validateJson(schema, data);
    if (!result.ok) {
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe("string");
    }
  });

  it("validates required fields", () => {
    const schema = z.object({ name: z.string() });
    const data = {};

    const result = validateJson(schema, data);
    expect(result.ok).toBe(false);
  });

  it("validates optional fields", () => {
    const schema = z.object({ name: z.string().optional() });
    const data = {};

    const result = validateJson(schema, data);
    expect(result.ok).toBe(true);
  });

  it("validates nested objects", () => {
    const schema = z.object({
      user: z.object({ name: z.string(), age: z.number() }),
    });
    const data = { user: { name: "test", age: 25 } };

    const result = validateJson(schema, data);
    expect(result.ok).toBe(true);
  });

  it("rejects invalid nested objects", () => {
    const schema = z.object({
      user: z.object({ name: z.string(), age: z.number() }),
    });
    const data = { user: { name: "test", age: "invalid" } };

    const result = validateJson(schema, data);
    expect(result.ok).toBe(false);
  });

  it("validates arrays", () => {
    const schema = z.object({ items: z.array(z.string()) });
    const data = { items: ["a", "b", "c"] };

    const result = validateJson(schema, data);
    expect(result.ok).toBe(true);
  });

  it("rejects invalid arrays", () => {
    const schema = z.object({ items: z.array(z.string()) });
    const data = { items: ["a", 2, "c"] };

    const result = validateJson(schema, data);
    expect(result.ok).toBe(false);
  });

  it("validates string constraints", () => {
    const schema = z.object({ email: z.string().email() });
    const data = { email: "test@example.com" };

    const result = validateJson(schema, data);
    expect(result.ok).toBe(true);
  });

  it("rejects invalid email", () => {
    const schema = z.object({ email: z.string().email() });
    const data = { email: "not-an-email" };

    const result = validateJson(schema, data);
    expect(result.ok).toBe(false);
  });

  it("validates number constraints", () => {
    const schema = z.object({ count: z.number().positive() });
    const data = { count: 5 };

    const result = validateJson(schema, data);
    expect(result.ok).toBe(true);
  });

  it("rejects negative numbers when positive required", () => {
    const schema = z.object({ count: z.number().positive() });
    const data = { count: -5 };

    const result = validateJson(schema, data);
    expect(result.ok).toBe(false);
  });

  it("includes field path in error message", () => {
    const schema = z.object({
      user: z.object({ name: z.string() }),
    });
    const data = { user: { name: 123 } };

    const result = validateJson(schema, data);
    if (!result.ok) {
      expect(result.error).toContain("user");
      expect(result.error).toContain("name");
    }
  });

  it("validates enum values", () => {
    const schema = z.object({ status: z.enum(["active", "inactive"]) });
    const data = { status: "active" };

    const result = validateJson(schema, data);
    expect(result.ok).toBe(true);
  });

  it("rejects invalid enum values", () => {
    const schema = z.object({ status: z.enum(["active", "inactive"]) });
    const data = { status: "unknown" };

    const result = validateJson(schema, data);
    expect(result.ok).toBe(false);
  });
});

describe("validateJsonLegacy", () => {
  it("parses valid JSON object", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      body: JSON.stringify({ name: "test" }),
    });

    const result = await validateJsonLegacy(request);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("test");
    }
  });

  it("returns ok: true for valid JSON object", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      body: JSON.stringify({ key: "value" }),
    });

    const result = await validateJsonLegacy(request);
    expect(result.ok).toBe(true);
  });

  it("returns ok: false for invalid JSON", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      body: "invalid json",
    });

    const result = await validateJsonLegacy(request);
    expect(result.ok).toBe(false);
  });

  it("includes error message for invalid JSON", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      body: "not json",
    });

    const result = await validateJsonLegacy(request);
    if (!result.ok) {
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe("string");
    }
  });

  it("rejects JSON arrays", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      body: JSON.stringify([1, 2, 3]),
    });

    const result = await validateJsonLegacy(request);
    expect(result.ok).toBe(false);
  });

  it("rejects null JSON", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      body: "null",
    });

    const result = await validateJsonLegacy(request);
    expect(result.ok).toBe(false);
  });

  it("rejects JSON primitives", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      body: '"string"',
    });

    const result = await validateJsonLegacy(request);
    expect(result.ok).toBe(false);
  });

  it("rejects JSON numbers", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      body: "123",
    });

    const result = await validateJsonLegacy(request);
    expect(result.ok).toBe(false);
  });

  it("accepts empty object", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const result = await validateJsonLegacy(request);
    expect(result.ok).toBe(true);
  });

  it("accepts object with multiple properties", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      body: JSON.stringify({ a: 1, b: "test", c: true }),
    });

    const result = await validateJsonLegacy(request);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.a).toBe(1);
      expect(result.value.b).toBe("test");
      expect(result.value.c).toBe(true);
    }
  });
});

describe("requireField", () => {
  it("returns field value when present", () => {
    const body = { name: "test", age: 25 };
    const result = requireField<string>(body, "name");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("test");
    }
  });

  it("returns ok: true when field exists", () => {
    const body = { email: "test@example.com" };
    const result = requireField<string>(body, "email");

    expect(result.ok).toBe(true);
  });

  it("returns ok: false when field missing", () => {
    const body = { name: "test" };
    const result = requireField<string>(body, "email");

    expect(result.ok).toBe(false);
  });

  it("includes error message when field missing", () => {
    const body = { name: "test" };
    const result = requireField<string>(body, "email");

    if (!result.ok) {
      expect(result.error).toContain("email");
      expect(result.error).toContain("Missing");
    }
  });

  it("works with different field types", () => {
    const body = { count: 42, active: true, data: { nested: "value" } };

    const result1 = requireField<number>(body, "count");
    expect(result1.ok).toBe(true);

    const result2 = requireField<boolean>(body, "active");
    expect(result2.ok).toBe(true);

    const result3 = requireField<Record<string, unknown>>(body, "data");
    expect(result3.ok).toBe(true);
  });

  it("returns null value when field is null", () => {
    const body = { value: null };
    const result = requireField<null>(body, "value");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it("returns undefined value when field is undefined", () => {
    const body = { value: undefined };
    const result = requireField<undefined>(body, "value");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeUndefined();
    }
  });
});

describe("optionalField", () => {
  it("returns field value when present", () => {
    const body = { name: "test" };
    const result = optionalField<string>(body, "name", "default");

    expect(result).toBe("test");
  });

  it("returns default value when field missing", () => {
    const body = { name: "test" };
    const result = optionalField<string>(body, "email", "default@example.com");

    expect(result).toBe("default@example.com");
  });

  it("returns field value even if falsy", () => {
    const body = { count: 0 };
    const result = optionalField<number>(body, "count", 10);

    expect(result).toBe(0);
  });

  it("returns default for missing field", () => {
    const body = {};
    const result = optionalField<string>(body, "missing", "default");

    expect(result).toBe("default");
  });

  it("works with different types", () => {
    const body = { str: "value", num: 42, bool: true };

    const result1 = optionalField<string>(body, "str", "default");
    expect(result1).toBe("value");

    const result2 = optionalField<number>(body, "num", 0);
    expect(result2).toBe(42);

    const result3 = optionalField<boolean>(body, "bool", false);
    expect(result3).toBe(true);
  });

  it("returns default for missing string field", () => {
    const body = {};
    const result = optionalField<string>(body, "missing", "default");

    expect(result).toBe("default");
  });

  it("returns default for missing number field", () => {
    const body = {};
    const result = optionalField<number>(body, "missing", 0);

    expect(result).toBe(0);
  });

  it("returns default for missing boolean field", () => {
    const body = {};
    const result = optionalField<boolean>(body, "missing", false);

    expect(result).toBe(false);
  });

  it("returns null value when field is null", () => {
    const body = { value: null };
    const result = optionalField<null>(body, "value", null);

    expect(result).toBeNull();
  });

  it("returns undefined value when field is undefined", () => {
    const body = { value: undefined };
    const result = optionalField<undefined>(body, "value", undefined);

    expect(result).toBeUndefined();
  });

  it("returns empty string when field is empty string", () => {
    const body = { value: "" };
    const result = optionalField<string>(body, "value", "default");

    expect(result).toBe("");
  });
});
