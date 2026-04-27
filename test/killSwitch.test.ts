import { describe, expect, test, beforeEach, jest } from "bun:test";
import { checkKillSwitch, isTradingPaused } from "../src/killSwitch";

describe("killSwitch", () => {
  let mockGet: jest.Mock;

  beforeEach(() => {
    mockGet = jest.fn();
  });

  test("returns enabled: false when KV is undefined", async () => {
    const result = await checkKillSwitch(undefined);
    expect(result.enabled).toBe(false);
  });

  test("returns enabled: false when KV returns null", async () => {
    mockGet.mockResolvedValue(null);
    const kv = { get: mockGet } as any;
    const result = await checkKillSwitch(kv);
    expect(result.enabled).toBe(false);
  });

  test("returns enabled: true when KV returns 'true'", async () => {
    mockGet.mockResolvedValue("true");
    const kv = { get: mockGet } as any;
    const result = await checkKillSwitch(kv);
    expect(result.enabled).toBe(true);
  });

  test("returns enabled: true when KV returns 'TRUE' (case insensitive)", async () => {
    mockGet.mockResolvedValue("TRUE");
    const kv = { get: mockGet } as any;
    const result = await checkKillSwitch(kv);
    expect(result.enabled).toBe(true);
  });

  test("returns enabled: false for other values", async () => {
    mockGet.mockResolvedValue("false");
    const kv = { get: mockGet } as any;
    const result = await checkKillSwitch(kv);
    expect(result.enabled).toBe(false);
  });

  test("handles KV error gracefully", async () => {
    mockGet.mockRejectedValue(new Error("KV Error"));
    const kv = { get: mockGet } as any;
    const result = await checkKillSwitch(kv);
    expect(result.enabled).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("isTradingPaused returns boolean", async () => {
    mockGet.mockResolvedValue(null);
    const kv = { get: mockGet } as any;
    const result = await isTradingPaused(kv);
    expect(typeof result).toBe("boolean");
  });
});
