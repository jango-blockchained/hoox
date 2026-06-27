import { describe, expect, test, beforeEach, jest } from "bun:test";
import { checkKillSwitch, isTradingPaused } from "../src/killSwitch";
import { KVKeys } from "@jango-blockchained/hoox-shared/kvKeys";

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

  // S-1 regression tests — the canonical kill switch KV key must
  // be the same across all workers (hoox reads, trade-worker reads,
  // agent-worker and telegram-worker write). Previously the hoox
  // gateway used the bare 'global:kill_switch' key, which meant
  // the gateway would reject signals but the trade-worker would
  // still execute them. After the fix, both workers use
  // KVKeys.KV_TRADE_KILL_SWITCH = 'trade:kill_switch'.

  test("reads the canonical KV_TRADE_KILL_SWITCH key (not the legacy 'global:kill_switch')", async () => {
    mockGet.mockResolvedValue("true");
    const kv = { get: mockGet } as any;
    await checkKillSwitch(kv);
    // The first argument to kv.get must be the canonical key, not
    // the legacy 'global:kill_switch' or the bare 'kill_switch'.
    const calledKey = mockGet.mock.calls[0][0];
    expect(calledKey).toBe(KVKeys.KV_TRADE_KILL_SWITCH);
    expect(calledKey).toBe("trade:kill_switch");
    expect(calledKey).not.toBe("global:kill_switch");
    expect(calledKey).not.toBe("kill_switch");
  });

  test("returns enabled: true when canonical key holds 'true' (interops with trade-worker)", async () => {
    // The hoox gateway and trade-worker must both observe the same
    // key. This test pins down the hoox side: if the agent-worker
    // writes trade:kill_switch=true, the hoox gateway should see it.
    mockGet.mockImplementation(async (key: string) => {
      if (key === KVKeys.KV_TRADE_KILL_SWITCH) return "true";
      return null;
    });
    const kv = { get: mockGet } as any;
    const result = await checkKillSwitch(kv);
    expect(result.enabled).toBe(true);
  });
});
