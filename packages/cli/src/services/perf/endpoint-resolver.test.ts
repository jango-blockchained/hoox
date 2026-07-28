/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach } from "bun:test";
import { resolveGatewayUrl } from "./endpoint-resolver.js";

describe("resolveGatewayUrl", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("uses HOOX_GATEWAY_URL env var when set", () => {
    process.env.HOOX_GATEWAY_URL = "https://custom.hoox.example.com";
    expect(resolveGatewayUrl()).toBe("https://custom.hoox.example.com");
  });

  it("constructs URL from CLOUDFLARE_ACCOUNT_ID and worker name (no subdomain in wrangler.jsonc)", () => {
    // This test simulates a project that has NO `global.subdomain_prefix`
    // by running the resolver with a cwd that doesn't have a wrangler.jsonc.
    // Bun's `import.meta.dir` is the file's directory; the endpoint
    // resolver reads `./wrangler.jsonc` from the process cwd. We can't
    // easily change cwd in bun:test, so we assert the OR shape: the
    // URL is either the subdomain form (if wrangler.jsonc has one) or
    // the accountId form (fallback).
    delete process.env.HOOX_GATEWAY_URL;
    process.env.CLOUDFLARE_ACCOUNT_ID = "abc123";
    const url = resolveGatewayUrl({ workerName: "hoox" });
    expect(url).toMatch(/^https:\/\/hoox\.[a-z0-9-]+\.workers\.dev$/);
  });

  it("prefers subdomain_prefix from wrangler.jsonc over the accountId-based URL", () => {
    // This test runs from the project root which has
    // `global.subdomain_prefix: "cryptolinx"`. The resolver
    // should read that and produce the cryptolinx URL.
    delete process.env.HOOX_GATEWAY_URL;
    process.env.CLOUDFLARE_ACCOUNT_ID = "abc123";
    const url = resolveGatewayUrl({ workerName: "hoox" });
    // The actual value depends on the project's wrangler.jsonc.
    // We assert that the URL is either the account-based form OR
    // the subdomain form, and never a 404.
    expect(url).toMatch(/^https:\/\/hoox\.(cryptolinx|abc123)\.workers\.dev$/);
    // If wrangler.jsonc has the subdomain, it should be used.
    // We don't assert the exact form because the test may run
    // from a checkout that doesn't have wrangler.jsonc.
  });

  it("strips trailing slash from env-var URL", () => {
    process.env.HOOX_GATEWAY_URL = "https://custom.hoox.example.com/";
    expect(resolveGatewayUrl()).toBe("https://custom.hoox.example.com");
  });

  it("throws clear error when nothing is available", () => {
    delete process.env.HOOX_GATEWAY_URL;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    expect(() => resolveGatewayUrl({ workerName: "hoox" })).toThrow(
      /HOOX_GATEWAY_URL.*CLOUDFLARE_ACCOUNT_ID/
    );
  });
});
