/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test";
import {
  toError,
  createJsonResponse,
  createSuccessResponse,
  createErrorResponse,
  Errors,
} from "../../src/errors";

type ResponseBody = Record<string, unknown>;

describe("Error Utilities", () => {
  describe("toError", () => {
    it("extracts message from Error objects", () => {
      const error = new Error("Test error message");
      expect(toError(error)).toBe("Test error message");
    });

    it("returns string errors as-is", () => {
      expect(toError("String error")).toBe("String error");
    });

    it("extracts message from objects with message property", () => {
      const error = { message: "Object error" };
      expect(toError(error)).toBe("Object error");
    });

    it("returns fallback for null", () => {
      expect(toError(null)).toBe("Unknown error");
    });

    it("returns fallback for undefined", () => {
      expect(toError(undefined)).toBe("Unknown error");
    });

    it("uses custom fallback message", () => {
      expect(toError(null, "Custom fallback")).toBe("Custom fallback");
    });

    it("stringifies objects without message property", () => {
      const error = { code: "TEST_CODE", details: "test" };
      const result = toError(error);
      expect(result).toContain("TEST_CODE");
    });

    it("handles circular references gracefully", () => {
      const error: any = { message: "Circular" };
      error.self = error;
      expect(() => toError(error)).not.toThrow();
    });

    it("handles very long error messages", () => {
      const longMessage = "x".repeat(10000);
      const error = new Error(longMessage);
      expect(toError(error)).toBe(longMessage);
    });

    it("handles special characters in error messages", () => {
      const message = "Error: <script>alert('xss')</script>";
      const error = new Error(message);
      expect(toError(error)).toBe(message);
    });

    it("handles errors with custom properties", () => {
      const error = new Error("Base error");
      (error as any).customProp = "custom value";
      expect(toError(error)).toBe("Base error");
    });
  });

  describe("createJsonResponse", () => {
    it("creates response with 200 status by default", async () => {
      const response = createJsonResponse({ test: "data" });
      expect(response.status).toBe(200);
    });

    it("creates response with custom status", async () => {
      const response = createJsonResponse({ test: "data" }, 201);
      expect(response.status).toBe(201);
    });

    it("includes Content-Type header", async () => {
      const response = createJsonResponse({ test: "data" });
      expect(response.headers.get("Content-Type")).toBe("application/json");
    });

    it("returns valid JSON response", async () => {
      const response = createJsonResponse({ test: "data" });
      const body = (await response.json()) as ResponseBody;
      expect(body.test).toBe("data");
    });

    it("sanitizes Error objects in response", async () => {
      const error = new Error("Test error");
      (error as unknown as Record<string, unknown>).stack =
        "Error: Test error\n  at Function.test";
      const response = createJsonResponse({ error });
      const body = (await response.json()) as ResponseBody;
      expect(body.error as ResponseBody).toHaveProperty("message");
      expect(body.error as ResponseBody).toHaveProperty("name");
      expect(body.error as ResponseBody).not.toHaveProperty("stack");
    });

    it("removes stack traces from nested errors", async () => {
      const error = new Error("Nested error");
      (error as unknown as Record<string, unknown>).stack =
        "Error: Nested error\n  at Function.test";
      const response = createJsonResponse({ nested: { error } });
      const body = (await response.json()) as ResponseBody;
      expect(
        (body.nested as ResponseBody).error as ResponseBody
      ).not.toHaveProperty("stack");
    });

    it("removes cause chains from errors", async () => {
      const cause = new Error("Cause error");
      const error = new Error("Main error");
      (error as unknown as Record<string, unknown>).cause = cause;
      const response = createJsonResponse({ error });
      const body = (await response.json()) as ResponseBody;
      expect(body.error as ResponseBody).not.toHaveProperty("cause");
    });

    it("sanitizes arrays of errors", async () => {
      const errors = [
        new Error("Error 1"),
        new Error("Error 2"),
        new Error("Error 3"),
      ];
      errors.forEach((e) => {
        (e as unknown as Record<string, unknown>).stack = "stack trace";
      });
      const response = createJsonResponse({ errors });
      const body = (await response.json()) as ResponseBody;
      expect(Array.isArray(body.errors)).toBe(true);
      expect((body.errors as unknown[])[0] as ResponseBody).not.toHaveProperty(
        "stack"
      );
    });

    it("handles null and undefined values", async () => {
      const response = createJsonResponse({ null: null, undefined });
      const body = (await response.json()) as ResponseBody;
      expect(body.null).toBeNull();
      expect(body.undefined).toBeUndefined();
    });

    it("handles deeply nested objects", async () => {
      const data = {
        level1: {
          level2: {
            level3: {
              value: "deep",
            },
          },
        },
      };
      const response = createJsonResponse(data);
      const body = (await response.json()) as ResponseBody;
      expect(
        (
          ((body.level1 as ResponseBody).level2 as ResponseBody)
            .level3 as ResponseBody
        ).value
      ).toBe("deep");
    });

    it("handles arrays of mixed types", async () => {
      const data = [1, "string", true, null, { obj: "value" }];
      const response = createJsonResponse(data);
      const body = (await response.json()) as unknown[];
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(5);
    });
  });

  describe("createSuccessResponse", () => {
    it("creates response with success: true", async () => {
      const response = createSuccessResponse({ data: "test" });
      const body = (await response.json()) as ResponseBody;
      expect(body.success).toBe(true);
    });

    it("includes result in response", async () => {
      const data = { id: 1, name: "test" };
      const response = createSuccessResponse(data);
      const body = (await response.json()) as ResponseBody;
      expect(body.result).toEqual(data);
    });

    it("returns 200 status", async () => {
      const response = createSuccessResponse();
      expect(response.status).toBe(200);
    });

    it("includes Content-Type header", async () => {
      const response = createSuccessResponse();
      expect(response.headers.get("Content-Type")).toBe("application/json");
    });

    it("handles undefined result", async () => {
      const response = createSuccessResponse();
      const body = (await response.json()) as ResponseBody;
      expect(body.success).toBe(true);
      expect(body.result).toBeUndefined();
    });

    it("sanitizes Error objects in result", async () => {
      const error = new Error("Test error");
      (error as unknown as Record<string, unknown>).stack = "stack trace";
      const response = createSuccessResponse({ error });
      const body = (await response.json()) as ResponseBody;
      expect(
        (body.result as ResponseBody).error as ResponseBody
      ).not.toHaveProperty("stack");
    });
  });

  describe("createErrorResponse", () => {
    it("creates error response with string message", async () => {
      const response = createErrorResponse("Test error");
      expect(response.status).toBe(500);
      const body = (await response.json()) as ResponseBody;
      expect(body.error).toBe("Test error");
      expect(body.success).toBe(false);
    });

    it("creates error response with custom status for string", async () => {
      const response = createErrorResponse("Bad request", 400);
      expect(response.status).toBe(400);
      const body = (await response.json()) as ResponseBody;
      expect(body.error).toBe("Bad request");
    });

    it("creates error response from AppError object", async () => {
      const error = {
        message: "Validation failed",
        status: 400,
        code: "VALIDATION_ERROR",
      };
      const response = createErrorResponse(error);
      expect(response.status).toBe(400);
      const body = (await response.json()) as ResponseBody;
      expect(body.error).toBe("Validation failed");
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("includes error code from AppError", async () => {
      const error = {
        message: "Not found",
        status: 404,
        code: "NOT_FOUND",
      };
      const response = createErrorResponse(error);
      const body = (await response.json()) as ResponseBody;
      expect(body.code).toBe("NOT_FOUND");
    });

    it("includes error details from AppError", async () => {
      const error = {
        message: "Validation failed",
        status: 400,
        code: "VALIDATION_ERROR",
        details: { field: "email", reason: "invalid format" },
      };
      const response = createErrorResponse(error);
      const body = (await response.json()) as ResponseBody;
      expect(body.details).toEqual({
        field: "email",
        reason: "invalid format",
      });
    });

    it("defaults to 500 status for AppError without status", async () => {
      const error = {
        message: "Unknown error",
      };
      const response = createErrorResponse(error as unknown as string);
      expect(response.status).toBe(500);
    });

    it("includes Content-Type header", async () => {
      const response = createErrorResponse("Test error");
      expect(response.headers.get("Content-Type")).toBe("application/json");
    });

    it("returns valid JSON response", async () => {
      const response = createErrorResponse("Test error");
      const body = (await response.json()) as ResponseBody;
      expect(body).toHaveProperty("error");
      expect(body).toHaveProperty("success");
    });

    it("does not include code if not provided", async () => {
      const error = { message: "Error", status: 400 };
      const response = createErrorResponse(error as unknown as string);
      const body = (await response.json()) as ResponseBody;
      expect(body).not.toHaveProperty("code");
    });

    it("does not include details if not provided", async () => {
      const error = { message: "Error", status: 400 };
      const response = createErrorResponse(error as unknown as string);
      const body = (await response.json()) as ResponseBody;
      expect(body).not.toHaveProperty("details");
    });
  });
});

describe("Error Response Creators (Errors object)", () => {
  describe("Errors.badRequest", () => {
    it("returns 400 status with error message", async () => {
      const response = Errors.badRequest("Invalid input");
      expect(response.status).toBe(400);
      const body = (await response.json()) as ResponseBody;
      expect(body.error).toBe("Invalid input");
    });

    it("includes BAD_REQUEST code", async () => {
      const response = Errors.badRequest("Invalid input");
      const body = (await response.json()) as ResponseBody;
      expect(body.code).toBe("BAD_REQUEST");
    });

    it("includes Content-Type header", async () => {
      const response = Errors.badRequest("Invalid input");
      expect(response.headers.get("Content-Type")).toBe("application/json");
    });

    it("returns valid JSON response", async () => {
      const response = Errors.badRequest("Invalid input");
      const body = (await response.json()) as ResponseBody;
      expect(body).toHaveProperty("error");
      expect(body.success).toBe(false);
    });

    it("handles long error messages", async () => {
      const longMessage = "x".repeat(10000);
      const response = Errors.badRequest(longMessage);
      const body = (await response.json()) as ResponseBody;
      expect(body.error).toBe(longMessage);
    });

    it("handles special characters in error messages", async () => {
      const message = "Error: <script>alert('xss')</script>";
      const response = Errors.badRequest(message);
      const body = (await response.json()) as ResponseBody;
      expect(body.error).toBe(message);
    });
  });

  describe("Errors.unauthorized", () => {
    it("returns 401 status with error message", async () => {
      const response = Errors.unauthorized("Missing credentials");
      expect(response.status).toBe(401);
      const body = (await response.json()) as ResponseBody;
      expect(body.error).toBe("Missing credentials");
    });

    it("uses default message if not provided", async () => {
      const response = Errors.unauthorized();
      expect(response.status).toBe(401);
      const body = (await response.json()) as ResponseBody;
      expect(body.error).toBe("Unauthorized");
    });

    it("includes UNAUTHORIZED code", async () => {
      const response = Errors.unauthorized("Missing credentials");
      const body = (await response.json()) as ResponseBody;
      expect(body.code).toBe("UNAUTHORIZED");
    });

    it("includes Content-Type header", async () => {
      const response = Errors.unauthorized();
      expect(response.headers.get("Content-Type")).toBe("application/json");
    });
  });

  describe("Errors.forbidden", () => {
    it("returns 403 status with error message", async () => {
      const response = Errors.forbidden("Access denied");
      expect(response.status).toBe(403);
      const body = (await response.json()) as ResponseBody;
      expect(body.error).toBe("Access denied");
    });

    it("uses default message if not provided", async () => {
      const response = Errors.forbidden();
      expect(response.status).toBe(403);
      const body = (await response.json()) as ResponseBody;
      expect(body.error).toBe("Forbidden");
    });

    it("includes FORBIDDEN code", async () => {
      const response = Errors.forbidden("Access denied");
      const body = (await response.json()) as ResponseBody;
      expect(body.code).toBe("FORBIDDEN");
    });
  });

  describe("Errors.notFound", () => {
    it("returns 404 status with error message", async () => {
      const response = Errors.notFound("Resource not found");
      expect(response.status).toBe(404);
      const body = (await response.json()) as ResponseBody;
      expect(body.error).toBe("Resource not found");
    });

    it("uses default message if not provided", async () => {
      const response = Errors.notFound();
      expect(response.status).toBe(404);
      const body = (await response.json()) as ResponseBody;
      expect(body.error).toBe("Not found");
    });

    it("includes NOT_FOUND code", async () => {
      const response = Errors.notFound("Resource not found");
      const body = (await response.json()) as ResponseBody;
      expect(body.code).toBe("NOT_FOUND");
    });
  });

  describe("Errors.methodNotAllowed", () => {
    it("returns 405 status with error message", async () => {
      const response = Errors.methodNotAllowed("POST not allowed");
      expect(response.status).toBe(405);
      const body = (await response.json()) as ResponseBody;
      expect(body.error).toBe("POST not allowed");
    });

    it("uses default message if not provided", async () => {
      const response = Errors.methodNotAllowed();
      expect(response.status).toBe(405);
      const body = (await response.json()) as ResponseBody;
      expect(body.error).toBe("Method not allowed");
    });

    it("includes METHOD_NOT_ALLOWED code", async () => {
      const response = Errors.methodNotAllowed("POST not allowed");
      const body = (await response.json()) as ResponseBody;
      expect(body.code).toBe("METHOD_NOT_ALLOWED");
    });
  });

  describe("Errors.rateLimited", () => {
    it("returns 429 status", async () => {
      const response = Errors.rateLimited();
      expect(response.status).toBe(429);
    });

    it("includes RATE_LIMITED code", async () => {
      const response = Errors.rateLimited();
      const body = (await response.json()) as ResponseBody;
      expect(body.code).toBe("RATE_LIMITED");
    });

    it("includes rate limit message", async () => {
      const response = Errors.rateLimited();
      const body = (await response.json()) as ResponseBody;
      expect(body.error).toBe("Rate limit exceeded");
    });

    it("includes Retry-After header when provided", async () => {
      const response = Errors.rateLimited(60);
      expect(response.headers.get("Retry-After")).toBe("60");
    });

    it("does not include Retry-After header when not provided", async () => {
      const response = Errors.rateLimited();
      expect(response.headers.get("Retry-After")).toBeNull();
    });

    it("handles numeric Retry-After values", async () => {
      const response = Errors.rateLimited(3600);
      expect(response.headers.get("Retry-After")).toBe("3600");
    });
  });

  describe("Errors.internal", () => {
    it("returns 500 status", async () => {
      const response = Errors.internal();
      expect(response.status).toBe(500);
    });

    it("includes INTERNAL_ERROR code", async () => {
      const response = Errors.internal();
      const body = (await response.json()) as ResponseBody;
      expect(body.code).toBe("INTERNAL_ERROR");
    });

    it("uses default message when no error provided", async () => {
      const response = Errors.internal();
      const body = (await response.json()) as ResponseBody;
      expect(body.error).toBe("Internal server error");
    });

    it("extracts message from Error object", async () => {
      const error = new Error("Database connection failed");
      const response = Errors.internal(error);
      const body = (await response.json()) as ResponseBody;
      expect(body.error).toBe("Database connection failed");
    });

    it("extracts message from string error", async () => {
      const response = Errors.internal("Service unavailable");
      const body = (await response.json()) as ResponseBody;
      expect(body.error).toBe("Service unavailable");
    });

    it("extracts message from object with message property", async () => {
      const error = { message: "Custom error message" };
      const response = Errors.internal(error);
      const body = (await response.json()) as ResponseBody;
      expect(body.error).toBe("Custom error message");
    });

    it("uses fallback for null error", async () => {
      const response = Errors.internal(null);
      const body = (await response.json()) as ResponseBody;
      expect(body.error).toBe("Internal server error");
    });

    it("uses fallback for undefined error", async () => {
      const response = Errors.internal(undefined);
      const body = (await response.json()) as ResponseBody;
      expect(body.error).toBe("Internal server error");
    });

    it("does not expose stack traces", async () => {
      const error = new Error("Database error");
      (error as unknown as Record<string, unknown>).stack =
        "Error: Database error\n  at Function.test";
      const response = Errors.internal(error);
      const body = (await response.json()) as ResponseBody;
      expect(String(body.error)).not.toContain("at Function");
    });

    it("handles circular references in error objects", async () => {
      const error: unknown = new Error("Circular error");
      (error as Record<string, unknown>).self = error;
      expect(() => Errors.internal(error)).not.toThrow();
    });
  });
});

describe("Error Response Format Consistency", () => {
  it("all error responses include success: false", async () => {
    const responses = [
      Errors.badRequest("Error 1"),
      Errors.unauthorized("Error 2"),
      Errors.forbidden("Error 3"),
      Errors.notFound("Error 4"),
      Errors.methodNotAllowed("Error 5"),
      Errors.rateLimited(),
      Errors.internal(),
    ];

    for (const response of responses) {
      const body = (await response.json()) as ResponseBody;
      expect(body.success).toBe(false);
    }
  });

  it("all error responses include error message", async () => {
    const responses = [
      Errors.badRequest("Error 1"),
      Errors.unauthorized("Error 2"),
      Errors.forbidden("Error 3"),
      Errors.notFound("Error 4"),
      Errors.methodNotAllowed("Error 5"),
      Errors.rateLimited(),
      Errors.internal(),
    ];

    for (const response of responses) {
      const body = (await response.json()) as ResponseBody;
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    }
  });

  it("all error responses include error code", async () => {
    const responses = [
      Errors.badRequest("Error 1"),
      Errors.unauthorized("Error 2"),
      Errors.forbidden("Error 3"),
      Errors.notFound("Error 4"),
      Errors.methodNotAllowed("Error 5"),
      Errors.rateLimited(),
      Errors.internal(),
    ];

    for (const response of responses) {
      const body = (await response.json()) as ResponseBody;
      expect(body).toHaveProperty("code");
      expect(typeof body.code).toBe("string");
    }
  });

  it("all error responses have Content-Type: application/json", async () => {
    const responses = [
      Errors.badRequest("Error 1"),
      Errors.unauthorized("Error 2"),
      Errors.forbidden("Error 3"),
      Errors.notFound("Error 4"),
      Errors.methodNotAllowed("Error 5"),
      Errors.rateLimited(),
      Errors.internal(),
    ];

    for (const response of responses) {
      expect(response.headers.get("Content-Type")).toBe("application/json");
    }
  });

  it("error responses are valid JSON", async () => {
    const responses = [
      Errors.badRequest("Error 1"),
      Errors.unauthorized("Error 2"),
      Errors.forbidden("Error 3"),
      Errors.notFound("Error 4"),
      Errors.methodNotAllowed("Error 5"),
      Errors.rateLimited(),
      Errors.internal(),
    ];

    for (const response of responses) {
      expect(() => response.json()).not.toThrow();
    }
  });
});

describe("Error Handling Edge Cases", () => {
  it("handles multiple error responses in sequence", async () => {
    const response1 = Errors.badRequest("Error 1");
    const response2 = Errors.unauthorized("Error 2");
    const response3 = Errors.notFound("Error 3");

    expect(response1.status).toBe(400);
    expect(response2.status).toBe(401);
    expect(response3.status).toBe(404);

    const body1 = (await response1.json()) as ResponseBody;
    const body2 = (await response2.json()) as ResponseBody;
    const body3 = (await response3.json()) as ResponseBody;

    expect(body1.error).toBe("Error 1");
    expect(body2.error).toBe("Error 2");
    expect(body3.error).toBe("Error 3");
  });

  it("handles errors with custom properties", async () => {
    const error = new Error("Custom error");
    (error as unknown as Record<string, unknown>).customProp = "custom value";
    (error as unknown as Record<string, unknown>).code = "CUSTOM_CODE";
    const response = Errors.internal(error);
    const body = (await response.json()) as ResponseBody;
    expect(body.error).toBe("Custom error");
  });

  it("handles response with custom headers", async () => {
    const response = Errors.badRequest("Invalid input");
    response.headers.set("X-Custom-Header", "custom-value");
    expect(response.headers.get("X-Custom-Header")).toBe("custom-value");
  });

  it("handles errors with numeric status codes", async () => {
    const error = {
      message: "Custom error",
      status: 418,
      code: "TEAPOT",
    };
    const response = createErrorResponse(error);
    expect(response.status).toBe(418);
    const body = (await response.json()) as ResponseBody;
    expect(body.code).toBe("TEAPOT");
  });

  it("handles errors with empty message", async () => {
    const response = Errors.badRequest("");
    expect(response.status).toBe(400);
    const body = (await response.json()) as ResponseBody;
    expect(body.error).toBe("");
  });

  it("handles errors with whitespace-only message", async () => {
    const response = Errors.badRequest("   ");
    expect(response.status).toBe(400);
    const body = (await response.json()) as ResponseBody;
    expect(body.error).toBe("   ");
  });

  it("handles errors with unicode characters", async () => {
    const message = "Error: 你好世界 🌍 مرحبا";
    const response = Errors.badRequest(message);
    const body = (await response.json()) as ResponseBody;
    expect(body.error).toBe(message);
  });

  it("handles errors with newlines and tabs", async () => {
    const message = "Error:\n\tLine 1\n\tLine 2";
    const response = Errors.badRequest(message);
    const body = (await response.json()) as ResponseBody;
    expect(body.error).toBe(message);
  });

  it("handles errors with JSON-like content", async () => {
    const message = 'Error: {"key": "value"}';
    const response = Errors.badRequest(message);
    const body = (await response.json()) as ResponseBody;
    expect(body.error).toBe(message);
  });

  it("handles AppError with undefined details", async () => {
    const error = {
      message: "Error",
      status: 400,
      code: "TEST",
      details: undefined,
    };
    const response = createErrorResponse(error);
    const body = (await response.json()) as ResponseBody;
    expect(body.details).toBeUndefined();
  });

  it("handles AppError with empty details object", async () => {
    const error = {
      message: "Error",
      status: 400,
      code: "TEST",
      details: {},
    };
    const response = createErrorResponse(error);
    const body = (await response.json()) as ResponseBody;
    expect(body.details).toEqual({});
  });

  it("handles AppError with nested details", async () => {
    const error = {
      message: "Error",
      status: 400,
      code: "TEST",
      details: {
        field: "email",
        nested: {
          reason: "invalid format",
          suggestions: ["user@example.com"],
        },
      },
    };
    const response = createErrorResponse(error);
    const body = (await response.json()) as ResponseBody;
    expect(
      ((body.details as ResponseBody).nested as ResponseBody).suggestions
    ).toEqual(["user@example.com"]);
  });
});

describe("Error Response Status Codes", () => {
  it("badRequest returns 400", async () => {
    const response = Errors.badRequest("test");
    expect(response.status).toBe(400);
  });

  it("unauthorized returns 401", async () => {
    const response = Errors.unauthorized("test");
    expect(response.status).toBe(401);
  });

  it("forbidden returns 403", async () => {
    const response = Errors.forbidden("test");
    expect(response.status).toBe(403);
  });

  it("notFound returns 404", async () => {
    const response = Errors.notFound("test");
    expect(response.status).toBe(404);
  });

  it("methodNotAllowed returns 405", async () => {
    const response = Errors.methodNotAllowed("test");
    expect(response.status).toBe(405);
  });

  it("rateLimited returns 429", async () => {
    const response = Errors.rateLimited();
    expect(response.status).toBe(429);
  });

  it("internal returns 500", async () => {
    const response = Errors.internal();
    expect(response.status).toBe(500);
  });
});

describe("Error Response Error Codes", () => {
  it("badRequest includes BAD_REQUEST code", async () => {
    const response = Errors.badRequest("test");
    const body = (await response.json()) as ResponseBody;
    expect(body.code).toBe("BAD_REQUEST");
  });

  it("unauthorized includes UNAUTHORIZED code", async () => {
    const response = Errors.unauthorized("test");
    const body = (await response.json()) as ResponseBody;
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("forbidden includes FORBIDDEN code", async () => {
    const response = Errors.forbidden("test");
    const body = (await response.json()) as ResponseBody;
    expect(body.code).toBe("FORBIDDEN");
  });

  it("notFound includes NOT_FOUND code", async () => {
    const response = Errors.notFound("test");
    const body = (await response.json()) as ResponseBody;
    expect(body.code).toBe("NOT_FOUND");
  });

  it("methodNotAllowed includes METHOD_NOT_ALLOWED code", async () => {
    const response = Errors.methodNotAllowed("test");
    const body = (await response.json()) as ResponseBody;
    expect(body.code).toBe("METHOD_NOT_ALLOWED");
  });

  it("rateLimited includes RATE_LIMITED code", async () => {
    const response = Errors.rateLimited();
    const body = (await response.json()) as ResponseBody;
    expect(body.code).toBe("RATE_LIMITED");
  });

  it("internal includes INTERNAL_ERROR code", async () => {
    const response = Errors.internal();
    const body = (await response.json()) as ResponseBody;
    expect(body.code).toBe("INTERNAL_ERROR");
  });
});
