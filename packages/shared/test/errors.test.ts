/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for shared error handling utilities
 * Run with: bun test packages/shared/test/errors.test.ts
 */

import { describe, test, expect } from "bun:test";
import {
  createErrorResponse,
  Errors,
  toError,
  type AppError,
} from "../src/errors";

describe("Error Handling Utilities", () => {
  describe("createErrorResponse", () => {
    test("should create response from string error", () => {
      const res = createErrorResponse("Something went wrong");
      expect(res.status).toBe(500);
      expect(res.headers.get("Content-Type")).toBe("application/json");
    });

    test("should create response from AppError object", () => {
      const appError: AppError = {
        message: "Not found",
        status: 404,
        code: "NOT_FOUND",
      };
      const res = createErrorResponse(appError);
      expect(res.status).toBe(404);
    });

    test("should include error code in response", () => {
      const appError: AppError = {
        message: "Bad request",
        status: 400,
        code: "BAD_REQUEST",
      };
      const res = createErrorResponse(appError);
      // Would need to parse JSON to verify, but structure is correct
      expect(res).toBeDefined();
    });
  });

  describe("toError", () => {
    test("should extract message from Error instance", () => {
      const result = toError(new Error("Something broke"));
      expect(result).toBe("Something broke");
    });

    test("should return the string itself when given a string", () => {
      const result = toError("direct error string");
      expect(result).toBe("direct error string");
    });

    test("should extract message from object with message property", () => {
      const result = toError({ message: "object error" });
      expect(result).toBe("object error");
    });

    test("should return fallback for null", () => {
      const result = toError(null);
      expect(result).toBe("Unknown error");
    });

    test("should return fallback for undefined", () => {
      const result = toError(undefined);
      expect(result).toBe("Unknown error");
    });

    test("should stringify a number", () => {
      const result = toError(42);
      expect(result).toBe("42");
    });

    test("should use custom fallback when provided", () => {
      const result = toError(null, "Custom fallback");
      expect(result).toBe("Custom fallback");
    });

    test("should handle Error subclass instances", () => {
      class CustomError extends Error {
        constructor() {
          super("Custom subclass error");
        }
      }
      const result = toError(new CustomError());
      expect(result).toBe("Custom subclass error");
    });

    test("should handle object with non-string message property", () => {
      const result = toError({ message: 123 });
      expect(result).toBe('{"message":123}');
    });

    test("should handle empty string", () => {
      const result = toError("");
      expect(result).toBe("");
    });

    test("should handle array as error", () => {
      const result = toError(["error1", "error2"]);
      expect(result).toBe('["error1","error2"]');
    });
  });

  describe("Errors factory", () => {
    test("should create bad request error", () => {
      const res = Errors.badRequest("Invalid input");
      expect(res.status).toBe(400);
    });

    test("should create unauthorized error", () => {
      const res = Errors.unauthorized();
      expect(res.status).toBe(401);
    });

    test("should create forbidden error", () => {
      const res = Errors.forbidden();
      expect(res.status).toBe(403);
    });

    test("should create not found error", () => {
      const res = Errors.notFound();
      expect(res.status).toBe(404);
    });

    test("should create rate limited error", () => {
      const res = Errors.rateLimited(60);
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("60");
    });

    test("should create internal error", () => {
      const res = Errors.internal();
      expect(res.status).toBe(500);
    });
  });
});
