/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test";
import { WizardEngine } from "../../src/wizard/engine";

describe("WizardEngine", () => {
  it("starts at PREREQUISITES step", () => {
    const engine = new WizardEngine();
    expect(engine.getCurrentStep().id).toBe("PREREQUISITES");
  });

  it("canProceed is false on initial state", () => {
    const engine = new WizardEngine();
    expect(engine.canProceed()).toBe(false);
  });

  it("advances to next step after execute succeeds", () => {
    const engine = new WizardEngine();
    const errors = engine.execute({ checksPassed: true });
    expect(errors).toEqual([]);
    expect(engine.getCurrentStep().id).toBe("CLOUDFLARE_CONFIG");
  });

  it("canGoBack is false on PREREQUISITES", () => {
    const engine = new WizardEngine();
    expect(engine.canGoBack()).toBe(false);
  });

  it("canGoBack is true after advancing", () => {
    const engine = new WizardEngine();
    engine.execute({ checksPassed: true });
    expect(engine.canGoBack()).toBe(true);
  });

  it("goBack returns to previous step", () => {
    const engine = new WizardEngine();
    engine.execute({ checksPassed: true });
    engine.goBack();
    expect(engine.getCurrentStep().id).toBe("PREREQUISITES");
  });

  it("returns validation errors for CLOUDFLARE_CONFIG with empty input", () => {
    const engine = new WizardEngine();
    engine.execute({ checksPassed: true });
    const errors = engine.execute({});
    expect(errors.length).toBeGreaterThan(0);
    // didn't advance
    expect(engine.getCurrentStep().id).toBe("CLOUDFLARE_CONFIG");
  });

  it("accepts non-hex but non-empty account ID (engine only validates required)", () => {
    const engine = new WizardEngine();
    engine.execute({ checksPassed: true });
    const errors = engine.execute({
      apiToken: "tok_xxx",
      accountId: "my-account-id-string",
      secretStoreId: "",
      subdomain: "myapp",
    });
    expect(errors.length).toBe(0);
    expect(engine.getCurrentStep().id).toBe("WORKER_SELECTION");
  });

  it("buildConfig returns valid WorkersJsonConfig after minimal preset", () => {
    const engine = new WizardEngine();
    engine.execute({ checksPassed: true });
    engine.execute({
      apiToken: "test-token",
      accountId: "abc123def456abc123def456abc123de",
      secretStoreId: "",
      subdomain: "myapp",
    });
    engine.execute({ preset: "minimal" });
    const config = engine.buildConfig();
    expect(config.global.cloudflare_account_id).toBe(
      "abc123def456abc123def456abc123de"
    );
    expect(config.global.subdomain_prefix).toBe("myapp");
    expect(Object.keys(config.workers).length).toBeGreaterThan(0);
    expect(config.workers["d1-worker"]).toBeDefined();
    expect(config.workers.hoox).toBeDefined();
  });

  it("reset clears all state", () => {
    const engine = new WizardEngine();
    engine.execute({ checksPassed: true });
    engine.reset();
    expect(engine.getCurrentStep().id).toBe("PREREQUISITES");
    expect(engine.getState().completedSteps).toEqual([]);
  });

  it("returns selected integrations from standard preset", () => {
    const engine = new WizardEngine();
    engine.execute({ checksPassed: true });
    engine.execute({
      apiToken: "test-token",
      accountId: "abc123def456abc123def456abc123de",
      secretStoreId: "",
      subdomain: "myapp",
    });
    engine.execute({ preset: "standard" });
    const state = engine.getState();
    expect(state.selectedIntegrations).toContain("binance");
    expect(state.selectedIntegrations).toContain("telegram");
  });

  it("getProvisioningPlan returns databases for selected workers", () => {
    const engine = new WizardEngine();
    engine.execute({ checksPassed: true });
    engine.execute({
      apiToken: "test-token",
      accountId: "abc123def456abc123def456abc123de",
      secretStoreId: "",
      subdomain: "myapp",
    });
    engine.execute({ preset: "standard" });
    const plan = engine.getProvisioningPlan();
    expect(plan.d1Databases).toContain("hoox-db");
    expect(plan.kvNamespaces).toContain("CONFIG_KV");
  });

  it("loads from existing state", () => {
    const existingState = {
      step: "CLOUDFLARE_CONFIG" as const,
      completedSteps: ["PREREQUISITES" as const],
      selectedWorkers: [],
      selectedIntegrations: [],
      secrets: {},
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
    const engine = new WizardEngine(existingState);
    expect(engine.getCurrentStep().id).toBe("CLOUDFLARE_CONFIG");
    expect(engine.getCompletedSteps()).toContain("PREREQUISITES");
  });

  it("allows custom worker selection", () => {
    const engine = new WizardEngine();
    engine.execute({ checksPassed: true });
    engine.execute({
      apiToken: "test-token",
      accountId: "abc123def456abc123def456abc123de",
      secretStoreId: "",
      subdomain: "myapp",
    });
    engine.execute({
      preset: "custom",
      workers: ["trade-worker"],
      integrations: ["binance"],
    });
    const state = engine.getState();
    expect(state.selectedWorkers).toContain("trade-worker");
    expect(state.selectedWorkers).toContain("d1-worker"); // auto-resolved
    expect(state.selectedIntegrations).toContain("binance");
  });
});
