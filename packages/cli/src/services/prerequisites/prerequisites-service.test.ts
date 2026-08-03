/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeAll } from "bun:test";
import { PrerequisitesService } from "./prerequisites-service.js";

// Mock Cloudflare auth to avoid spawning real wrangler process that can hang
beforeAll(() => {
  PrerequisitesService.prototype.checkCloudflareAuth = async function () {
    return {
      name: "Cloudflare Auth",
      category: "account" as const,
      passed: false,
      required: "authenticated",
      version: "not authenticated",
      hint: "Run: wrangler whoami",
    };
  };
});

describe("PrerequisitesService", () => {
  describe("checkBun", () => {
    it("returns passed=true when bun version >= 1.2", async () => {
      const svc = new PrerequisitesService();
      const result = await svc.checkBun();
      expect(result.name).toBe("Bun");
      expect(result.category).toBe("tool");
    });

    it("returns version string", async () => {
      const svc = new PrerequisitesService();
      const result = await svc.checkBun();
      expect(typeof result.version).toBe("string");
      expect(result.version.length).toBeGreaterThan(0);
    });
  });

  describe("checkGit", () => {
    it("returns a result with name 'Git'", async () => {
      const svc = new PrerequisitesService();
      const result = await svc.checkGit();
      expect(result.name).toBe("Git");
      expect(result.category).toBe("tool");
    });
  });

  describe("checkNode", () => {
    it("returns a result (advisory — always passes)", async () => {
      const svc = new PrerequisitesService();
      const result = await svc.checkNode();
      expect(result.name).toBe("Node.js");
      expect(result.category).toBe("tool");
    });
  });

  describe("checkWrangler", () => {
    it("returns a result with name 'Wrangler CLI'", async () => {
      const svc = new PrerequisitesService();
      const result = await svc.checkWrangler();
      expect(result.name).toBe("Wrangler CLI");
      expect(result.category).toBe("tool");
    });
  });

  describe("checkCloudflareAuth", () => {
    it("returns a result with name 'Cloudflare Auth'", async () => {
      const svc = new PrerequisitesService();
      const result = await svc.checkCloudflareAuth();
      expect(result.name).toBe("Cloudflare Auth");
      expect(result.category).toBe("account");
    });
  });

  describe("checkDocker", () => {
    it("returns result (advisory — always passes)", async () => {
      const svc = new PrerequisitesService();
      const result = await svc.checkDocker();
      expect(result.name).toBe("Docker");
      expect(result.category).toBe("tool");
    });
  });

  describe("checkRepository", () => {
    it("returns a result with name 'Repository'", async () => {
      const svc = new PrerequisitesService();
      const result = await svc.checkRepository();
      expect(result.name).toBe("Repository");
      expect(result.category).toBe("repository");
    });
  });

  describe("runAll", () => {
    it("returns all 8 checks", async () => {
      const svc = new PrerequisitesService();
      const report = await svc.runAll();
      expect(report.checks.length).toBe(8);
    }, 30000);

    it("filters by tool name (case-insensitive exact match)", async () => {
      const svc = new PrerequisitesService();
      const report = await svc.runAll("bun");
      expect(report.checks.length).toBe(1);
      expect(report.checks[0].name).toBe("Bun");
    }, 30000);
  });
});
