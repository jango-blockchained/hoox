/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test";
import {
  AGENT_CONFIG_KV_KEY,
  isAgentConfigEmbeddedField,
  parseAgentConfigJson,
  serializeAgentConfigForKv,
  getAgentConfigEmbeddedValue,
  setAgentConfigEmbeddedValue,
  expandAgentConfigToFieldMap,
  applyAgentConfigFieldUpdates,
} from "./agent-config-fields";

describe("agent-config-fields", () => {
  it("uses the agent:config KV key", () => {
    expect(AGENT_CONFIG_KV_KEY).toBe("agent:config");
  });

  it("identifies embedded composite field keys", () => {
    expect(isAgentConfigEmbeddedField("providers:default_provider")).toBe(true);
    expect(isAgentConfigEmbeddedField("models:openai_model")).toBe(true);
    expect(isAgentConfigEmbeddedField("risk:trailing_stop_percent")).toBe(true);
    expect(isAgentConfigEmbeddedField("risk:kill_switch")).toBe(false);
    expect(isAgentConfigEmbeddedField("agent:config")).toBe(false);
  });

  it("parses and round-trips agent config JSON", () => {
    const raw = serializeAgentConfigForKv({
      defaultProvider: "openai",
      timeoutMs: 10000,
      modelMap: { openai: "gpt-4o-mini" },
    });
    const parsed = parseAgentConfigJson(raw);
    expect(parsed.defaultProvider).toBe("openai");
    expect(parsed.timeoutMs).toBe(10000);
    // double-encoded
    const double = JSON.stringify(raw);
    const parsed2 = parseAgentConfigJson(double);
    expect(parsed2.defaultProvider).toBe("openai");
  });

  it("gets and sets top-level and model fields", () => {
    let cfg: Record<string, unknown> = {
      defaultProvider: "workers-ai",
      fallbackChain: ["workers-ai", "openai"],
      modelMap: { openai: "gpt-4o-mini" },
      timeoutMs: 30000,
    };
    expect(getAgentConfigEmbeddedValue(cfg, "providers:default_provider")).toBe(
      "workers-ai"
    );
    expect(getAgentConfigEmbeddedValue(cfg, "providers:fallback_chain")).toBe(
      '["workers-ai","openai"]'
    );
    expect(getAgentConfigEmbeddedValue(cfg, "models:openai_model")).toBe(
      "gpt-4o-mini"
    );

    cfg = setAgentConfigEmbeddedValue(
      cfg,
      "providers:default_provider",
      "anthropic"
    );
    cfg = setAgentConfigEmbeddedValue(cfg, "models:openai_model", "gpt-4o");
    cfg = setAgentConfigEmbeddedValue(cfg, "providers:timeout_ms", 15000);
    cfg = setAgentConfigEmbeddedValue(
      cfg,
      "providers:fallback_chain",
      '["openai","anthropic"]'
    );

    expect(cfg.defaultProvider).toBe("anthropic");
    expect(cfg.timeoutMs).toBe(15000);
    expect((cfg.modelMap as Record<string, string>).openai).toBe("gpt-4o");
    expect(cfg.fallbackChain).toEqual(["openai", "anthropic"]);
  });

  it("expands and batch-applies updates", () => {
    const cfg = applyAgentConfigFieldUpdates(
      { defaultProvider: "workers-ai", modelMap: {} },
      {
        "providers:default_provider": "google",
        "models:google_model": "gemini-1.5-pro-002",
        "risk:take_profit_percent": 0.2,
      }
    );
    const map = expandAgentConfigToFieldMap(cfg);
    expect(map["providers:default_provider"]).toBe("google");
    expect(map["models:google_model"]).toBe("gemini-1.5-pro-002");
    expect(map["risk:take_profit_percent"]).toBe(0.2);
  });
});
