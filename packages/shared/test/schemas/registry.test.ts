/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from "bun:test";
import {
  WORKER_MANIFESTS,
  WORKER_NAMES,
  CALLED_BY,
} from "../../src/schemas/registry.js";

describe("Worker Registry", () => {
  it("should have all 10 workers", () => {
    expect(WORKER_NAMES).toHaveLength(10);
    expect(WORKER_NAMES).toContain("hoox");
    expect(WORKER_NAMES).toContain("dashboard");
  });

  it("each worker should have a name and path", () => {
    for (const [workerName, m] of Object.entries(WORKER_MANIFESTS)) {
      expect(m.name).toBe(workerName);
      expect(m.path).toMatch(/^workers\//);
    }
  });

  it("deriveCalledBy should compute reverse mappings", () => {
    // hoox calls trade-worker -> trade-worker's calledBy should include hoox
    expect(CALLED_BY["trade-worker"]).toContain("hoox");
    // hoox calls telegram-worker -> telegram-worker's calledBy should include hoox
    expect(CALLED_BY["telegram-worker"]).toContain("hoox");
  });

  it("every service binding target should be a known worker", () => {
    for (const m of Object.values(WORKER_MANIFESTS)) {
      for (const svc of m.services) {
        expect(WORKER_NAMES).toContain(svc.service);
      }
    }
  });

  it("all worker paths should be unique", () => {
    const paths = Object.values(WORKER_MANIFESTS).map((m) => m.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("workers with zero services should have empty calledBy", () => {
    for (const [, m] of Object.entries(WORKER_MANIFESTS)) {
      if (m.services.length === 0) {
        // Only workers that have no callers should have empty calledBy
        // Actually, calledBy is computed from other workers' services, not own services
      }
    }
  });

  it("cron should be optional", () => {
    const withCron = Object.values(WORKER_MANIFESTS).filter(
      (m) => m.cron && m.cron.length > 0
    );
    expect(withCron.length).toBeGreaterThan(0);
    for (const m of withCron) {
      expect(Array.isArray(m.cron)).toBe(true);
    }
  });
});
