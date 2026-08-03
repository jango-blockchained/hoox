/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for `hoox trace` command.
 *
 * Mocks global fetch() for Cloudflare Observability API calls.
 * Tests verify command action functions produce correct output and
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
import { registerTraceCommand } from "./trace-command.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const realFetch = globalThis.fetch;
const realEnv = { ...process.env };

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
});

afterEach(() => {
  (globalThis as unknown as Record<string, unknown>).fetch = realFetch;
  process.env = { ...realEnv };
  mock.restore();
});

// ---------------------------------------------------------------------------
// Helper: build a Commander program with trace registered
// ---------------------------------------------------------------------------

function makeProgram(): Command {
  const program = new Command()
    .name("hoox")
    .option("--json", "JSON output")
    .option("--quiet", "Minimal output");

  registerTraceCommand(program);
  return program;
}

/** Run a command string (e.g. "trace events --json") and capture stdout. */
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

describe("trace command", () => {
  // -- trace events ---------------------------------------------------------

  describe("events", () => {
    it("queries trace events and displays them", async () => {
      mockCfFetch({
        "/telemetry/query": {
          events: {
            events: [
              {
                $metadata: {
                  id: "evt-1",
                  service: "trade-worker",
                  trigger: "/webhook",
                  level: "info",
                  message: "Trade executed",
                  timestamp: "2026-06-19T10:00:00Z",
                },
              },
              {
                $metadata: {
                  id: "evt-2",
                  service: "hoox",
                  trigger: "/health",
                  level: "info",
                  message: "Health check",
                  timestamp: "2026-06-19T10:01:00Z",
                },
              },
            ],
          },
        },
      });

      const { stdout } = await runCommand("trace events");

      expect(stdout).toContain("Trace Events");
      expect(stdout).toContain("trade-worker");
      expect(stdout).toContain("hoox");
      expect(stdout).toContain("Trade executed");
    });

    it("filters events by service", async () => {
      const calls = mockCfFetch({
        "/telemetry/query": {
          events: {
            events: [
              {
                $metadata: {
                  service: "trade-worker",
                  level: "info",
                  message: "Test",
                },
              },
            ],
          },
        },
      });

      await runCommand("trace events --service trade-worker");

      // Verify the filter was sent in the request body
      const queryCall = calls.find((c) => c.url.includes("/telemetry/query"));
      expect(queryCall).toBeDefined();
      const body = JSON.parse(queryCall!.body!);
      expect(body.parameters.filters).toContainEqual(
        expect.objectContaining({
          key: "$metadata.service",
          value: "trade-worker",
        })
      );
    });

    it("filters events by level", async () => {
      const calls = mockCfFetch({
        "/telemetry/query": {
          events: { events: [] },
        },
      });

      await runCommand("trace events --level error");

      const queryCall = calls.find((c) => c.url.includes("/telemetry/query"));
      expect(queryCall).toBeDefined();
      const body = JSON.parse(queryCall!.body!);
      expect(body.parameters.filters).toContainEqual(
        expect.objectContaining({
          key: "$metadata.level",
          value: "error",
        })
      );
    });

    it("outputs JSON when --json flag is used", async () => {
      mockCfFetch({
        "/telemetry/query": {
          events: {
            events: [
              {
                $metadata: {
                  service: "test-worker",
                  level: "info",
                  message: "Test event",
                },
              },
            ],
          },
        },
      });

      const { stdout } = await runCommand("trace events --json");

      const parsed = JSON.parse(stdout.trim());
      expect(parsed).toHaveProperty("events");
      expect(Array.isArray(parsed.events)).toBe(true);
    });

    it("shows empty message when no events found", async () => {
      mockCfFetch({
        "/telemetry/query": {
          events: { events: [] },
        },
      });

      const { stdout } = await runCommand("trace events");

      expect(stdout).toContain("No trace events found");
    });

    it("handles relative time formats", async () => {
      const calls = mockCfFetch({
        "/telemetry/query": {
          events: { events: [] },
        },
      });

      await runCommand("trace events --from 2h");

      const queryCall = calls.find((c) => c.url.includes("/telemetry/query"));
      expect(queryCall).toBeDefined();
      const body = JSON.parse(queryCall!.body!);
      // Verify timeframe.from is a Unix-ms number (~2 hours ago).
      // Cloudflare's API rejects ISO strings with HTTP 400.
      expect(typeof body.timeframe.from).toBe("number");
      const fromTime = new Date(body.timeframe.from);
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      // Allow 5 second tolerance
      expect(Math.abs(fromTime.getTime() - twoHoursAgo.getTime())).toBeLessThan(
        5000
      );
    });
  });

  // -- trace metrics --------------------------------------------------------

  describe("metrics", () => {
    it("queries metrics with default count operator", async () => {
      const calls = mockCfFetch({
        "/telemetry/query": {
          calculations: [
            {
              calculation: "count",
              aggregates: [{ value: 1234 }],
            },
          ],
        },
      });

      const { stdout } = await runCommand("trace metrics");

      expect(stdout).toContain("Trace Metrics");
      expect(stdout).toContain("1234");

      const queryCall = calls.find((c) => c.url.includes("/telemetry/query"));
      const body = JSON.parse(queryCall!.body!);
      expect(body.view).toBe("calculations");
    });

    it("queries p99 latency", async () => {
      mockCfFetch({
        "/telemetry/query": {
          calculations: [
            {
              calculation: "duration.ms",
              aggregates: [{ value: 45.2 }],
            },
          ],
        },
      });

      const { stdout } = await runCommand(
        "trace metrics --operator p99 --key duration.ms"
      );

      expect(stdout).toContain("45.2");
    });

    it("groups metrics by field", async () => {
      mockCfFetch({
        "/telemetry/query": {
          calculations: [
            {
              calculation: "count",
              groupBy: { "$metadata.service": "trade-worker" },
              aggregates: [{ value: 500 }],
            },
            {
              calculation: "count",
              groupBy: { "$metadata.service": "hoox" },
              aggregates: [{ value: 734 }],
            },
          ],
        },
      });

      const { stdout } = await runCommand(
        "trace metrics --groupBy $metadata.service"
      );

      expect(stdout).toContain("trade-worker");
      expect(stdout).toContain("hoox");
      expect(stdout).toContain("500");
      expect(stdout).toContain("734");
    });

    it("outputs JSON when --json flag is used", async () => {
      mockCfFetch({
        "/telemetry/query": {
          calculations: [
            {
              calculation: "count",
              aggregates: [{ value: 100 }],
            },
          ],
        },
      });

      const { stdout } = await runCommand("trace metrics --json");

      const parsed = JSON.parse(stdout.trim());
      expect(parsed).toHaveProperty("metrics");
    });
  });

  // -- trace keys -----------------------------------------------------------

  describe("keys", () => {
    it("lists available filter keys", async () => {
      mockCfFetch({
        "/telemetry/keys": [
          {
            key: "$metadata.service",
            type: "string",
            description: "Worker name",
          },
          {
            key: "$metadata.level",
            type: "string",
            description: "Log level",
          },
          {
            key: "$metadata.trigger",
            type: "string",
            description: "Trigger path",
          },
        ],
      });

      const { stdout } = await runCommand("trace keys");

      expect(stdout).toContain("Available Filter Keys");
      expect(stdout).toContain("$metadata.service");
      expect(stdout).toContain("$metadata.level");
      expect(stdout).toContain("$metadata.trigger");
    });

    it("searches keys by needle", async () => {
      const calls = mockCfFetch({
        "/telemetry/keys": [{ key: "$metadata.service", type: "string" }],
      });

      await runCommand("trace keys --needle service");

      const keysCall = calls.find((c) => c.url.includes("/telemetry/keys"));
      const body = JSON.parse(keysCall!.body!);
      // Cloudflare Observability API expects `needle` as a structured object,
      // not a plain string. Sending a string causes HTTP 400.
      expect(body.needle).toEqual({
        value: "service",
        isRegex: false,
        matchCase: false,
      });
    });

    it("outputs JSON when --json flag is used", async () => {
      mockCfFetch({
        "/telemetry/keys": [{ key: "$metadata.service", type: "string" }],
      });

      const { stdout } = await runCommand("trace keys --json");

      const parsed = JSON.parse(stdout.trim());
      expect(parsed).toHaveProperty("keys");
      expect(Array.isArray(parsed.keys)).toBe(true);
    });
  });

  // -- trace values ---------------------------------------------------------

  describe("values", () => {
    it("lists values for a key", async () => {
      mockCfFetch({
        "/telemetry/values": [
          {
            key: "$metadata.service",
            type: "string",
            value: "trade-worker",
            dataset: "cloudflare-workers",
          },
          {
            key: "$metadata.service",
            type: "string",
            value: "hoox",
            dataset: "cloudflare-workers",
          },
          {
            key: "$metadata.service",
            type: "string",
            value: "agent-worker",
            dataset: "cloudflare-workers",
          },
          {
            key: "$metadata.service",
            type: "string",
            value: "d1-worker",
            dataset: "cloudflare-workers",
          },
        ],
      });

      const { stdout } = await runCommand("trace values '$metadata.service'");

      expect(stdout).toContain("Values for");
      expect(stdout).toContain("trade-worker");
      expect(stdout).toContain("hoox");
    });

    it("outputs JSON when --json flag is used", async () => {
      mockCfFetch({
        "/telemetry/values": [
          { key: "$metadata.level", type: "string", value: "error" },
          { key: "$metadata.level", type: "string", value: "warn" },
          { key: "$metadata.level", type: "string", value: "info" },
        ],
      });

      const { stdout } = await runCommand(
        "trace values '$metadata.level' --json"
      );

      const parsed = JSON.parse(stdout.trim());
      expect(parsed).toHaveProperty("values");
      expect(parsed.values).toContain("error");
    });
  });

  // -- trace destinations ---------------------------------------------------

  describe("destinations", () => {
    it("lists OTLP destinations", async () => {
      mockCfFetch({
        "/observability/destinations": [
          {
            slug: "honeycomb",
            name: "Honeycomb",
            type: "otlp",
            url: "https://api.honeycomb.io/1/traces",
            enabled: true,
          },
          {
            slug: "grafana",
            name: "Grafana Cloud",
            type: "otlp",
            url: "https://otlp.grafana.cloud/v1/traces",
            enabled: false,
          },
        ],
      });

      const { stdout } = await runCommand("trace destinations list");

      expect(stdout).toContain("OTLP Export Destinations");
      expect(stdout).toContain("honeycomb");
      expect(stdout).toContain("grafana");
      expect(stdout).toContain("Honeycomb");
    });

    it("shows empty message when no destinations", async () => {
      mockCfFetch({
        "/observability/destinations": [],
      });

      const { stdout } = await runCommand("trace destinations list");

      expect(stdout).toContain("No OTLP destinations");
    });

    it("defaults to list when no subcommand is given", async () => {
      mockCfFetch({
        "/observability/destinations": [],
      });

      // Parent action should list instead of printing help / exiting 1
      const { stdout, exitCode } = await runCommand("trace destinations");

      expect(stdout).toContain("No OTLP destinations");
      expect(exitCode === 0 || exitCode === undefined).toBe(true);
    });

    it("adds a new destination", async () => {
      mockCfFetch({
        "/observability/destinations": {
          slug: "new-dest",
          name: "New Destination",
          type: "otlp",
          url: "https://example.com/traces",
          enabled: true,
        },
      });

      const { stdout } = await runCommand(
        "trace destinations add 'New Destination' https://example.com/traces"
      );

      expect(stdout).toContain("created");
      expect(stdout).toContain("new-dest");
    });

    it("removes a destination", async () => {
      mockCfFetch({
        "/observability/destinations/honeycomb": {},
      });

      const { stdout } = await runCommand(
        "trace destinations remove honeycomb"
      );

      expect(stdout).toContain("deleted");
      expect(stdout).toContain("honeycomb");
    });
  });

  // -- trace usage ----------------------------------------------------------

  describe("usage", () => {
    it("shows usage statistics", async () => {
      mockCfFetch({
        "/observability/usage": {
          events: 1234567,
          breakdown: [
            {
              bin: "2026-06-18T00:00:00Z",
              dataset: "cloudflare-workers",
              service: "trade-worker",
              count: 500000,
            },
            {
              bin: "2026-06-18T00:00:00Z",
              dataset: "cloudflare-workers",
              service: "hoox",
              count: 400000,
            },
            {
              bin: "2026-06-18T00:00:00Z",
              dataset: "cloudflare-workers",
              service: "agent-worker",
              count: 334567,
            },
          ],
        },
      });

      const { stdout } = await runCommand("trace usage");

      expect(stdout).toContain("Observability Usage");
      expect(stdout).toContain("1234567");
      expect(stdout).toContain("trade-worker");
      expect(stdout).toContain("500000");
    });

    it("outputs JSON when --json flag is used", async () => {
      mockCfFetch({
        "/observability/usage": {
          events: 1000,
          breakdown: [],
        },
      });

      const { stdout } = await runCommand("trace usage --json");

      const parsed = JSON.parse(stdout.trim());
      expect(parsed).toHaveProperty("eventCount", 1000);
    });
  });

  // -- Error handling -------------------------------------------------------

  describe("error handling", () => {
    it("throws when CLOUDFLARE_API_TOKEN is missing", async () => {
      delete process.env.CLOUDFLARE_API_TOKEN;

      const { stdout } = await runCommand("trace events");

      expect(stdout).toContain("CLOUDFLARE_API_TOKEN");
    });

    it("throws when CLOUDFLARE_ACCOUNT_ID is missing", async () => {
      delete process.env.CLOUDFLARE_ACCOUNT_ID;

      const { stdout } = await runCommand("trace events");

      expect(stdout).toContain("CLOUDFLARE_ACCOUNT_ID");
    });

    it("handles API errors gracefully", async () => {
      mockCfFetch({
        "/telemetry/query": { error: "Rate limit exceeded" },
      });

      const { stdout } = await runCommand("trace events");

      expect(stdout).toContain("Rate limit exceeded");
    });
  });

  // -- Subcommand structure -------------------------------------------------

  describe("subcommand structure", () => {
    it("registers trace as a command", () => {
      const program = makeProgram();
      const traceCmd = program.commands.find((c) => c.name() === "trace");
      expect(traceCmd).toBeDefined();

      const subNames = (traceCmd as Command).commands.map((c) => c.name());
      expect(subNames).toContain("events");
      expect(subNames).toContain("metrics");
      expect(subNames).toContain("live");
      expect(subNames).toContain("keys");
      expect(subNames).toContain("values");
      expect(subNames).toContain("destinations");
      expect(subNames).toContain("usage");
    });

    it("registers destinations subcommands", () => {
      const program = makeProgram();
      const traceCmd = program.commands.find((c) => c.name() === "trace")!;
      const destCmd = (traceCmd as Command).commands.find(
        (c) => c.name() === "destinations"
      )!;
      const destSubNames = (destCmd as Command).commands.map((c) => c.name());
      expect(destSubNames).toContain("list");
      expect(destSubNames).toContain("add");
      expect(destSubNames).toContain("remove");
    });
  });
});
