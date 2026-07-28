/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for `hoox waf` command.
 *
 * Mocks CloudflareService.zonesList() and global fetch() for Cloudflare API
 * calls. Tests verify command action functions produce correct output and
 * handle errors gracefully.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { Command } from "commander";
import { registerWafCommand } from "./waf-command.js";
import { CloudflareService } from "../../services/cloudflare/cloudflare-service.js";
import type { WranglerResult } from "../../services/cloudflare/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const realFetch = globalThis.fetch;
const realEnv = { ...process.env };

/** Mock CloudflareService.zonesList to return a known zone. */
function mockZonesList(output: string, ok = true, error?: string): void {
  const result: WranglerResult<string> = ok
    ? { ok: true, value: output }
    : { ok: false, error: error ?? "zone list failed" };

  spyOn(CloudflareService.prototype, "zonesList").mockImplementation(() =>
    Promise.resolve(result)
  );
}

/**
 * Sets up a mock fetch that returns a CF-style JSON response.
 * Returns the list of calls made to fetch for assertions.
 */
function mockCfFetch(
  responseMap: Record<string, unknown>
): Array<{ url: string; method: string; body?: string }> {
  const calls: Array<{ url: string; method: string; body?: string }> = [];

  const fetchMock = mock(
    async (url: string, init?: Record<string, unknown>) => {
      void init; // Mark as used
      // Find matching response by path partial match
      let matched: unknown = null;
      for (const [pathPattern, response] of Object.entries(responseMap)) {
        if ((url as string).includes(pathPattern)) {
          matched = response;
          break;
        }
      }

      calls.push({
        url: url as string,
        method: (init?.method ?? "GET") as string,
        body: init?.body as string | undefined,
      });

      if (
        matched &&
        typeof matched === "object" &&
        matched !== null &&
        "error" in (matched as Record<string, unknown>)
      ) {
        // Error response
        return {
          ok: false,
          status: 400,
          json: async () => ({
            success: false,
            errors: [{ message: (matched as Record<string, string>).error }],
          }),
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          result: matched,
        }),
      };
    }
  );

  (globalThis as unknown as Record<string, unknown>).fetch = fetchMock;
  return calls;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Set required env vars for CF API calls
  process.env.CLOUDFLARE_API_TOKEN = "test-token";
  process.env.CLOUDFLARE_ACCOUNT_ID = "test-account-id";
  process.env.CLOUDFLARE_ZONE_ID = ""; // force zonesList path
});

afterEach(() => {
  (globalThis as unknown as Record<string, unknown>).fetch = realFetch;
  process.env = { ...realEnv };
  mock.restore();
});

// ---------------------------------------------------------------------------
// Helper: build a Commander program with waf registered
// ---------------------------------------------------------------------------

function makeProgram(): Command {
  const program = new Command()
    .name("hoox")
    .option("--json", "JSON output")
    .option("--quiet", "Minimal output");

  registerWafCommand(program);
  return program;
}

/** Run a command string (e.g. "waf status --json") and capture stdout. */
async function runCommand(
  args: string
): Promise<{ stdout: string; exitCode: number }> {
  const program = makeProgram();

  let stdout = "";
  const writeSpy = spyOn(process.stdout, "write").mockImplementation(
    (chunk: unknown) => {
      stdout += typeof chunk === "string" ? chunk : String(chunk ?? "");
      return true;
    }
  );

  // We don't want process.exit() to kill the test runner
  const exitSpy = spyOn(process, "exit").mockImplementation(
    (() => {}) as never
  );

  try {
    await program.parseAsync([...args.split(" ")], { from: "user" });
  } catch {
    // Some commands may fail — that's fine, we test output
  }

  writeSpy.mockRestore();
  exitSpy.mockRestore();

  return { stdout, exitCode: 0 };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("waf command", () => {
  // -- waf status ------------------------------------------------------------

  describe("status", () => {
    it("shows WAF status when enabled", async () => {
      mockZonesList("example.com (abc123def456)");
      mockCfFetch({
        "/settings/waf": { id: "waf", value: "on" },
        "/firewall/rules": [
          {
            id: "rule-1",
            description: "Block bad IPs",
            action: "block",
            filter: { id: "f1", expression: "(ip.src eq 1.2.3.4)" },
            created_on: "2026-01-01T00:00:00Z",
            modified_on: "2026-01-02T00:00:00Z",
          },
        ],
        "/analytics/dashboard": { totals: { threats: 42 } },
      });

      const { stdout } = await runCommand("waf status");

      expect(stdout).toContain("example.com");
      expect(stdout).toContain("ENABLED");
      expect(stdout).toContain("1 active");
      expect(stdout).toContain("42");
    });

    it("shows WAF status when disabled", async () => {
      mockZonesList("example.com (abc123def456)");
      mockCfFetch({
        "/settings/waf": { id: "waf", value: "off" },
        "/firewall/rules": [],
        "/analytics/dashboard": { totals: { threats: 0 } },
      });

      const { stdout } = await runCommand("waf status");

      expect(stdout).toContain("DISABLED");
      expect(stdout).toContain("0 active");
      expect(stdout).toContain("0");
    });

    it("outputs JSON when --json flag is used", async () => {
      mockZonesList("example.com (abc123def456)");
      mockCfFetch({
        "/settings/waf": { id: "waf", value: "on" },
        "/firewall/rules": [],
        "/analytics/dashboard": { totals: { threats: 0 } },
      });

      const { stdout } = await runCommand("waf status --json");

      const parsed = JSON.parse(stdout.trim());
      expect(parsed).toHaveProperty("enabled", true);
      expect(parsed).toHaveProperty("zoneId", "abc123def456");
      expect(parsed).toHaveProperty("zoneName", "example.com");
    });

    it("throws when zonesList fails", async () => {
      mockZonesList("", false, "auth error");

      const { stdout } = await runCommand("waf status");

      expect(stdout).toContain("Failed to list zones");
    });

    it("uses CLOUDFLARE_ZONE_ID env var when set", async () => {
      process.env.CLOUDFLARE_ZONE_ID = "direct-zone-id";
      mockCfFetch({
        "/settings/waf": { id: "waf", value: "on" },
        "/firewall/rules": [],
        "/analytics/dashboard": { totals: { threats: 0 } },
      });

      const { stdout } = await runCommand("waf status");

      expect(stdout).toContain("direct-zone-id");
    });
  });

  // -- waf rules list --------------------------------------------------------

  describe("rules list", () => {
    it("lists firewall rules in human-readable format", async () => {
      mockZonesList("example.com (zone-1)");
      mockCfFetch({
        "/firewall/rules": [
          {
            id: "rule-1-is-a-very-long-id",
            description: "IP blocklist rule",
            action: "block",
            filter: {
              id: "f1",
              expression: "(ip.src eq 10.0.0.1)",
            },
            created_on: "2026-01-01T00:00:00Z",
            modified_on: "2026-01-02T00:00:00Z",
          },
          {
            id: "rule-2-short",
            description: "",
            action: "allow",
            filter: {
              id: "f2",
              expression: '(http.request.uri.path contains "/api")',
            },
            created_on: "2026-01-03T00:00:00Z",
            modified_on: "2026-01-04T00:00:00Z",
          },
        ],
      });

      const { stdout } = await runCommand("waf rules list");

      expect(stdout).toContain("IP blocklist rule");
      expect(stdout).toContain("block");
      expect(stdout).toContain("allow");
      expect(stdout).toContain("(ip.src eq 10.0.0.1)");
    });

    it("outputs JSON when --json flag is used", async () => {
      mockZonesList("example.com (zone-1)");
      mockCfFetch({
        "/firewall/rules": [
          {
            id: "rule-1",
            description: "Test rule",
            action: "block",
            filter: { id: "f1", expression: "(ip.src eq 1.1.1.1)" },
            created_on: "2026-01-01T00:00:00Z",
            modified_on: "2026-01-01T00:00:00Z",
          },
        ],
      });

      const { stdout } = await runCommand("waf rules list --json");

      const parsed = JSON.parse(stdout.trim());
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0]).toHaveProperty("id", "rule-1");
    });

    it("shows empty message when no rules exist", async () => {
      mockZonesList("example.com (zone-1)");
      mockCfFetch({ "/firewall/rules": [] });

      const { stdout } = await runCommand("waf rules list");

      expect(stdout).toContain("No firewall rules");
    });

    it("throws when rules fetch fails", async () => {
      mockZonesList("example.com (zone-1)");
      mockCfFetch({
        "/firewall/rules": { error: "API error" },
      });

      const { stdout } = await runCommand("waf rules list");

      expect(stdout).toContain("API error");
    });
  });

  // -- waf rules add ---------------------------------------------------------

  describe("rules add", () => {
    it("adds an IP allowlist rule", async () => {
      mockZonesList("example.com (zone-1)");
      mockCfFetch({
        "/filters": { id: "filter-1" },
        // NOTE: the firewall/rules endpoint is matched but returns array
        "/firewall/rules": [
          {
            id: "new-rule-1",
            description: "ip-allowlist rule for 192.168.1.1",
            action: "allow",
            filter: { id: "filter-1", expression: "(ip.src eq 192.168.1.1)" },
            created_on: "2026-01-01T00:00:00Z",
            modified_on: "2026-01-01T00:00:00Z",
          },
        ],
      });

      const { stdout } = await runCommand(
        "waf rules add ip-allowlist 192.168.1.1"
      );

      expect(stdout).toContain("WAF rule added");
      expect(stdout).toContain("192.168.1.1");
    });

    it("rejects invalid rule types", async () => {
      mockZonesList("example.com (zone-1)");

      const { stdout } = await runCommand("waf rules add invalid-type 1.2.3.4");

      expect(stdout).toContain("Invalid rule type");
    });

    it("throws when filter creation fails", async () => {
      mockZonesList("example.com (zone-1)");
      mockCfFetch({
        "/filters": { error: "Filter creation failed" },
      });

      const { stdout } = await runCommand(
        "waf rules add ip-blocklist 10.0.0.1"
      );

      expect(stdout).toContain("Filter creation failed");
    });
  });

  // -- waf rules remove ------------------------------------------------------

  describe("rules remove", () => {
    it("removes a WAF rule by ID", async () => {
      mockZonesList("example.com (zone-1)");
      mockCfFetch({
        "/firewall/rules/rule-to-delete": { id: "rule-to-delete" },
      });

      const { stdout } = await runCommand("waf rules remove rule-to-delete");

      expect(stdout).toContain("removed");
      expect(stdout).toContain("rule-to-delete");
    });

    it("throws when rule deletion fails", async () => {
      mockZonesList("example.com (zone-1)");
      mockCfFetch({
        "/firewall/rules/bad-id": { error: "Rule not found" },
      });

      const { stdout } = await runCommand("waf rules remove bad-id");

      expect(stdout).toContain("Rule not found");
    });
  });

  // -- waf mode --------------------------------------------------------------

  describe("mode", () => {
    it("enables WAF on the zone", async () => {
      mockZonesList("example.com (zone-1)");
      mockCfFetch({
        "/settings/waf": { id: "waf", value: "on" },
      });

      const { stdout } = await runCommand("waf mode enable");

      expect(stdout).toContain("enabled");
      expect(stdout).toContain("example.com");
    });

    it("disables WAF on the zone", async () => {
      mockZonesList("example.com (zone-1)");
      mockCfFetch({
        "/settings/waf": { id: "waf", value: "off" },
      });

      const { stdout } = await runCommand("waf mode disable");

      expect(stdout).toContain("disabled");
      expect(stdout).toContain("example.com");
    });

    it("throws when mode update fails", async () => {
      mockZonesList("example.com (zone-1)");
      mockCfFetch({
        "/settings/waf": { error: "Permission denied" },
      });

      const { stdout } = await runCommand("waf mode enable");

      expect(stdout).toContain("Permission denied");
    });
  });

  // -- Error handling --------------------------------------------------------

  describe("error handling", () => {
    it("throws when CLOUDFLARE_API_TOKEN is missing", async () => {
      delete process.env.CLOUDFLARE_API_TOKEN;
      mockZonesList("example.com (zone-1)");

      const { stdout } = await runCommand("waf status");

      expect(stdout).toContain("CLOUDFLARE_API_TOKEN");
    });

    it("throws when CLOUDFLARE_ACCOUNT_ID is missing", async () => {
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
      mockZonesList("example.com (zone-1)");

      const { stdout } = await runCommand("waf status");

      expect(stdout).toContain("CLOUDFLARE_ACCOUNT_ID");
    });
  });

  // -- Subcommand structure --------------------------------------------------

  describe("subcommand structure", () => {
    it("registers waf as a command", () => {
      const program = makeProgram();
      const wafCmd = program.commands.find((c) => c.name() === "waf");
      expect(wafCmd).toBeDefined();

      const subNames = (wafCmd as Command).commands.map((c) => c.name());
      expect(subNames).toContain("status");
      expect(subNames).toContain("rules");
      expect(subNames).toContain("mode");
    });

    it("registers rules subcommands", () => {
      const program = makeProgram();
      const wafCmd = program.commands.find((c) => c.name() === "waf")!;
      const rulesCmd = (wafCmd as Command).commands.find(
        (c) => c.name() === "rules"
      )!;
      const ruleSubNames = (rulesCmd as Command).commands.map((c) => c.name());
      expect(ruleSubNames).toContain("list");
      expect(ruleSubNames).toContain("add");
      expect(ruleSubNames).toContain("remove");
    });

    it("registers mode subcommands", () => {
      const program = makeProgram();
      const wafCmd = program.commands.find((c) => c.name() === "waf")!;
      const modeCmd = (wafCmd as Command).commands.find(
        (c) => c.name() === "mode"
      )!;
      const modeSubNames = (modeCmd as Command).commands.map((c) => c.name());
      expect(modeSubNames).toContain("enable");
      expect(modeSubNames).toContain("disable");
    });
  });
});
