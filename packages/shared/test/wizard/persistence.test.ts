/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test";
import { serializeState, deserializeState } from "../../src/wizard/persistence";
import type { WizardState } from "../../src/wizard/types";

describe("persistence", () => {
  it("serializes and deserializes state", () => {
    const state: WizardState = {
      step: "CLOUDFLARE_CONFIG",
      completedSteps: ["PREREQUISITES"],
      cloudflareConfig: {
        apiToken: "tok_xxx",
        accountId: "abc123",
        secretStoreId: "ss_1",
        subdomain: "myapp",
      },
      selectedWorkers: ["hoox", "d1-worker"],
      selectedIntegrations: ["binance"],
      secrets: { binance: { BINANCE_KEY_BINDING: "key123" } },
      preset: "minimal",
      startedAt: 1000,
      updatedAt: 2000,
    };

    const json = serializeState(state);
    const parsed = deserializeState(json);
    expect(parsed.step).toBe("CLOUDFLARE_CONFIG");
    expect(parsed.cloudflareConfig?.apiToken).toBe("tok_xxx");
    expect(parsed.selectedWorkers).toContain("hoox");
    expect(parsed.selectedIntegrations).toContain("binance");
    expect(parsed.secrets?.binance?.BINANCE_KEY_BINDING).toBe("key123");
    expect(parsed.preset).toBe("minimal");
  });

  it("handles minimal state", () => {
    const state: WizardState = {
      step: "PREREQUISITES",
      completedSteps: [],
      selectedWorkers: [],
      selectedIntegrations: [],
      secrets: {},
      startedAt: 0,
      updatedAt: 0,
    };

    const json = serializeState(state);
    const parsed = deserializeState(json);
    expect(parsed.step).toBe("PREREQUISITES");
    expect(parsed.completedSteps).toEqual([]);
  });
});
