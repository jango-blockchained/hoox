/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from "bun:test";
import { createCronHandler } from "../src/cron-handler";

describe("createCronHandler", () => {
  it("should create a cron handler function", () => {
    const handler = createCronHandler({
      name: "test-worker",
      handler: vi.fn().mockResolvedValue(undefined),
    });

    expect(typeof handler).toBe("function");
  });

  it("should call handler and log event details", async () => {
    const mockHandler = vi.fn().mockResolvedValue(undefined);
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };

    const handler = createCronHandler({
      name: "test-worker",
      handler: mockHandler,
      logger,
    });

    const mockEvent = {
      cron: "0 * * * *",
      scheduledTime: 1234567890,
    };

    await handler(mockEvent as any, {} as any, {} as any);

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("test-worker"),
      expect.objectContaining({
        cron: "0 * * * *",
        scheduledTime: 1234567890,
      })
    );
    expect(mockHandler).toHaveBeenCalledWith(mockEvent, {}, {});
  });

  it("should handle handler success", async () => {
    const mockHandler = vi.fn().mockResolvedValue({ result: "success" });
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };

    const handler = createCronHandler({
      name: "test-worker",
      handler: mockHandler,
      logger,
    });

    const mockEvent = {
      cron: "0 * * * *",
      scheduledTime: 1234567890,
    };

    await handler(mockEvent as any, {} as any, {} as any);

    // Check that the second call to logger.info contains "completed successfully"
    const calls = (logger.info as any).mock.calls;
    expect(calls[1][0]).toContain("completed successfully");
  });

  it("should handle handler errors", async () => {
    const mockError = new Error("Handler failed");
    const mockHandler = vi.fn().mockRejectedValue(mockError);
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };

    const handler = createCronHandler({
      name: "test-worker",
      handler: mockHandler,
      logger,
    });

    const mockEvent = {
      cron: "0 * * * *",
      scheduledTime: 1234567890,
    };

    try {
      await handler(mockEvent as any, {} as any, {} as any);
    } catch {
      // Expected to throw
    }

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("failed"),
      expect.anything()
    );
  });

  it("should measure execution time", async () => {
    const mockHandler = vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 50))
      );
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };

    const handler = createCronHandler({
      name: "test-worker",
      handler: mockHandler,
      logger,
    });

    const mockEvent = {
      cron: "0 * * * *",
      scheduledTime: 1234567890,
    };

    await handler(mockEvent as any, {} as any, {} as any);

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("completed"),
      expect.objectContaining({
        durationMs: expect.any(Number),
      })
    );
  });
});
