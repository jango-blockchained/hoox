import { describe, expect, test, beforeEach, jest } from "bun:test";
import { checkIpAllowlist, loadIpConfig, getDefaultAllowedIps } from "../src/ipAllowlist";

describe("ipAllowlist", () => {
  let mockGet: jest.Mock;

  beforeEach(() => {
    mockGet = jest.fn();
  });

  test("returns allowed: false when clientIp is null", async () => {
    const result = await checkIpAllowlist(undefined, null);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("No client IP provided");
  });

  test("returns allowed: false when clientIp is undefined", async () => {
    const result = await checkIpAllowlist(undefined, undefined);
    expect(result.allowed).toBe(false);
  });

  test("returns allowed: false when IP not in allowlist", async () => {
    const result = await checkIpAllowlist(undefined, "1.2.3.4");
    expect(result.allowed).toBe(false);
  });

  test("returns allowed: true for allowed IP", async () => {
    const result = await checkIpAllowlist(undefined, "52.89.214.238");
    expect(result.allowed).toBe(true);
  });

  test("returns allowed: false when IP check disabled via KV", async () => {
    mockGet.mockResolvedValueOnce("false");
    const kv = { get: mockGet } as any;
    const result = await checkIpAllowlist(kv, "1.2.3.4");
    expect(result.allowed).toBe(true);
    expect(result.config.enabled).toBe(false);
  });

  test("loads custom IPs from KV", async () => {
    mockGet
      .mockResolvedValueOnce("true")
      .mockResolvedValueOnce(JSON.stringify(["192.168.1.1", "10.0.0.1"]));
    const kv = { get: mockGet } as any;
    const result = await checkIpAllowlist(kv, "192.168.1.1");
    expect(result.allowed).toBe(true);
    expect(result.config.allowedIps.has("192.168.1.1")).toBe(true);
  });

  test("handles KV error gracefully", async () => {
    mockGet.mockRejectedValue(new Error("KV Error"));
    const kv = { get: mockGet } as any;
    const result = await checkIpAllowlist(kv, "52.89.214.238");
    expect(result.allowed).toBe(true);
  });

  test("handles malformed JSON in KV", async () => {
    mockGet
      .mockResolvedValueOnce("true")
      .mockResolvedValueOnce("not valid json");
    const kv = { get: mockGet } as any;
    const result = await checkIpAllowlist(kv, "52.89.214.238");
    expect(result.allowed).toBe(true);
  });

  test("getDefaultAllowedIps returns default IPs", async () => {
    const defaultIps = getDefaultAllowedIps();
    expect(defaultIps.has("52.89.214.238")).toBe(true);
    expect(defaultIps.has("34.212.75.30")).toBe(true);
  });
});

describe("loadIpConfig", () => {
  let mockGet: jest.Mock;

  beforeEach(() => {
    mockGet = jest.fn();
  });

  test("returns defaults when KV is undefined", async () => {
    const config = await loadIpConfig(undefined);
    expect(config.enabled).toBe(true);
    expect(config.allowedIps.size).toBe(4);
  });

  test("loads IP check enabled from KV", async () => {
    mockGet.mockResolvedValueOnce("false");
    const kv = { get: mockGet } as any;
    const config = await loadIpConfig(kv);
    expect(config.enabled).toBe(false);
  });
});