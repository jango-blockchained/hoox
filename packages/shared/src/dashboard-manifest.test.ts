import { describe, it, expect } from "bun:test";
import {
  parseDashboardManifest,
  buildDashboardKvKey,
  stripJsonc,
  dashboardWorkerDir,
} from "./dashboard-manifest";

const SAMPLE = `{
  "display_name": "Gateway",
  "description": "Webhook gateway",
  // comment
  "sections": {
    "global": {
      "title": "Global Rules",
      "priority": 10,
      "fields": {
        "kill_switch": false,
      },
      "descriptions": {
        "kill_switch": "Master kill switch",
      },
    },
    "routing": {
      "title": "Routing",
      "fields": {
        "default_exchange": "mexc",
        "default_leverage": 10,
      },
      "options": {
        "default_exchange": ["binance", "mexc", "bybit"],
        "default_leverage": [1, 5, 10],
      },
    },
  },
}`;

describe("dashboard-manifest", () => {
  it("stripJsonc removes comments and trailing commas", () => {
    const cleaned = stripJsonc(SAMPLE);
    expect(() => JSON.parse(cleaned)).not.toThrow();
    expect(cleaned).not.toContain("// comment");
  });

  it("parses sections and fields", () => {
    const m = parseDashboardManifest(SAMPLE, "hoox");
    expect(m.displayName).toBe("Gateway");
    expect(m.sections.length).toBe(2);
    const global = m.sections.find((s) => s.id === "global");
    expect(global?.fields[0]?.key).toBe("global:kill_switch");
    expect(global?.fields[0]?.type).toBe("boolean");
    expect(global?.fields[0]?.kind).toBe("dangerous");
  });

  it("marks select fields from options", () => {
    const m = parseDashboardManifest(SAMPLE, "hoox");
    const routing = m.sections.find((s) => s.id === "routing");
    const exchange = routing?.fields.find((f) =>
      f.key.endsWith("default_exchange")
    );
    expect(exchange?.type).toBe("select");
    expect(exchange?.options?.map((o) => o.value)).toEqual([
      "binance",
      "mexc",
      "bybit",
    ]);
  });

  it("buildDashboardKvKey uses section prefixes", () => {
    expect(buildDashboardKvKey("hoox", "global:kill_switch")).toBe(
      "global:kill_switch"
    );
    expect(
      buildDashboardKvKey("hoox", "webhook:tradingview_ip_check_enabled")
    ).toBe("webhook:tradingview_ip_check_enabled");
    expect(buildDashboardKvKey("trade-worker", "trade:max_position_size")).toBe(
      "trade:max_position_size"
    );
  });

  it("dashboardWorkerDir maps hoox → hoox-worker", () => {
    expect(dashboardWorkerDir("hoox")).toBe("hoox-worker");
    expect(dashboardWorkerDir("trade-worker")).toBe("trade-worker");
  });
});
