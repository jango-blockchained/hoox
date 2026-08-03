/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from "bun:test";
import { createQueueHandler } from "../src/queue-handler";

describe("createQueueHandler", () => {
  it("should create a queue handler function", () => {
    const handler = createQueueHandler({
      maxRetries: 3,
      backoffDelays: [0, 30, 60],
      onMessage: vi.fn().mockResolvedValue({ success: true }),
      onRetry: vi.fn(),
      onDLQ: vi.fn(),
    });

    expect(typeof handler).toBe("function");
  });

  it("should execute successful messages without retry", async () => {
    const onMessage = vi.fn().mockResolvedValue({ success: true });
    const onRetry = vi.fn();
    const onDLQ = vi.fn();

    const handler = createQueueHandler({
      maxRetries: 3,
      backoffDelays: [0, 30, 60],
      onMessage,
      onRetry,
      onDLQ,
    });

    const mockMsg = {
      body: { requestId: "123", action: "buy" },
      attempts: 0,
      retry: vi.fn(),
    };

    await handler({
      messages: [mockMsg as any],
      metadata: {} as any,
    } as any);

    expect(onMessage).toHaveBeenCalledWith(mockMsg.body, 0);
    expect(onRetry).not.toHaveBeenCalled();
    expect(onDLQ).not.toHaveBeenCalled();
  });

  it("should retry failed messages with exponential backoff", async () => {
    const onMessage = vi.fn().mockRejectedValue(new Error("Trade failed"));
    const onRetry = vi.fn();
    const onDLQ = vi.fn();

    const handler = createQueueHandler({
      maxRetries: 3,
      backoffDelays: [0, 30, 60],
      onMessage,
      onRetry,
      onDLQ,
    });

    const mockMsg = {
      body: { requestId: "123", action: "buy" },
      attempts: 0,
      retry: vi.fn(),
    };

    await handler({
      messages: [mockMsg as any],
      metadata: {} as any,
    } as any);

    expect(onRetry).toHaveBeenCalledWith(
      mockMsg.body,
      0,
      "Trade failed",
      0 // backoff delay
    );
    expect(mockMsg.retry).toHaveBeenCalledWith({ delaySeconds: 0 });
    expect(onDLQ).not.toHaveBeenCalled();
  });

  it("should move messages to DLQ after max retries", async () => {
    const onMessage = vi.fn().mockRejectedValue(new Error("Trade failed"));
    const onRetry = vi.fn();
    const onDLQ = vi.fn();

    const handler = createQueueHandler({
      maxRetries: 3,
      backoffDelays: [0, 30, 60],
      onMessage,
      onRetry,
      onDLQ,
    });

    const mockMsg = {
      body: { requestId: "123", action: "buy" },
      attempts: 3, // Already at max
      retry: vi.fn(),
    };

    await handler({
      messages: [mockMsg as any],
      metadata: {} as any,
    } as any);

    expect(onDLQ).toHaveBeenCalledWith(mockMsg.body, 3, "Trade failed");
    expect(mockMsg.retry).not.toHaveBeenCalled();
  });

  it("should handle multiple messages in batch", async () => {
    const onMessage = vi.fn().mockResolvedValue({ success: true });
    const onRetry = vi.fn();
    const onDLQ = vi.fn();

    const handler = createQueueHandler({
      maxRetries: 3,
      backoffDelays: [0, 30, 60],
      onMessage,
      onRetry,
      onDLQ,
    });

    const mockMsgs = [
      { body: { requestId: "1", action: "buy" }, attempts: 0, retry: vi.fn() },
      { body: { requestId: "2", action: "sell" }, attempts: 0, retry: vi.fn() },
    ];

    await handler({
      messages: mockMsgs as any,
      metadata: {} as any,
    } as any);

    expect(onMessage).toHaveBeenCalledTimes(2);
    expect(onMessage).toHaveBeenNthCalledWith(1, mockMsgs[0].body, 0);
    expect(onMessage).toHaveBeenNthCalledWith(2, mockMsgs[1].body, 0);
  });
});
