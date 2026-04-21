import { describe, expect, test, beforeEach, jest } from "bun:test";
import { getOrCreateSession, updateSession } from "../src/sessionManager";

describe("sessionManager", () => {
  let mockGet: jest.Mock;
  let mockPut: jest.Mock;

  beforeEach(() => {
    mockGet = jest.fn();
    mockPut = jest.fn();
  });

  test("creates new session when KV undefined", async () => {
    const result = await getOrCreateSession(undefined);
    expect(result.sessionId).toBeDefined();
    expect(result.isNew).toBe(true);
  });

  test("uses provided session ID", async () => {
    const result = await getOrCreateSession(undefined, "test-session");
    expect(result.sessionId).toBe("test-session");
    expect(result.isNew).toBe(true);
  });

  test("detects existing session", async () => {
    mockGet.mockResolvedValue(JSON.stringify({ lastSeen: "2024-01-01" }));
    const kv = { get: mockGet, put: mockPut } as any;
    const result = await getOrCreateSession(kv, "existing-session");
    expect(result.isNew).toBe(false);
  });

  test("updates session on access", async () => {
    mockGet.mockResolvedValue(null);
    mockPut.mockResolvedValue(undefined);
    const kv = { get: mockGet, put: mockPut } as any;
    await getOrCreateSession(kv, "test-session");
    expect(mockPut).toHaveBeenCalled();
  });

  test("handles KV error gracefully", async () => {
    mockGet.mockRejectedValue(new Error("KV Error"));
    const kv = { get: mockGet, put: mockPut } as any;
    const result = await getOrCreateSession(kv, "test-session");
    expect(result.sessionId).toBe("test-session");
  });

  test("updateSession does nothing when KV undefined", async () => {
    await updateSession(undefined, "test-session");
  });

  test("updateSession updates session", async () => {
    mockPut.mockResolvedValue(undefined);
    const kv = { put: mockPut } as any;
    await updateSession(kv, "test-session");
    expect(mockPut).toHaveBeenCalled();
  });
});