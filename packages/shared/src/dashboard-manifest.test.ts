import { describe, it, expect } from "bun:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseDashboardManifest,
  buildDashboardKvKey,
  stripJsonc,
  dashboardWorkerDir,
  loadDashboardKvManifestFromRoot,
} from "./dashboard-manifest";

const MONOREPO_ROOT = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../.."
);

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
    // Unknown section keeps section:name (not bare name)
    expect(buildDashboardKvKey("agent-worker", "risk:kill_switch")).toBe(
      "risk:kill_switch"
    );
  });

  it("dashboardWorkerDir maps hoox → hoox-worker", () => {
    expect(dashboardWorkerDir("hoox")).toBe("hoox-worker");
    expect(dashboardWorkerDir("trade-worker")).toBe("trade-worker");
  });

  it("loadDashboardKvManifestFromRoot builds keys from monorepo", () => {
    const m = loadDashboardKvManifestFromRoot(MONOREPO_ROOT);
    expect(m.namespace).toBe("CONFIG_KV");
    expect(m.keys.length).toBeGreaterThan(20);
    expect(m.keys.some((k) => k.key === "trade:kill_switch")).toBe(true);
    expect(m.keys.some((k) => k.key === "global:kill_switch")).toBe(true);
    // API-doc pseudo fields must not appear
    expect(m.keys.every((k) => !/^POST\s+\//i.test(k.key))).toBe(true);
  });
});
