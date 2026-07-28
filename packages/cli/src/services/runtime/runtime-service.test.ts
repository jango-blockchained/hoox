/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getRuntimeStatus } from "./runtime-service.js";

describe("getRuntimeStatus", () => {
  const temps: string[] = [];
  const origHome = process.env.HOOX_HOME;
  const origRepo = process.env.HOOX_REPO;

  afterEach(() => {
    if (origHome !== undefined) process.env.HOOX_HOME = origHome;
    else delete process.env.HOOX_HOME;
    if (origRepo !== undefined) process.env.HOOX_REPO = origRepo;
    else delete process.env.HOOX_REPO;
    for (const t of temps) {
      try {
        rmSync(t, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    temps.length = 0;
  });

  it("reports missing global runtime outside a setup repo", () => {
    const base = mkdtempSync(join(tmpdir(), "hoox-home-"));
    const outside = mkdtempSync(join(tmpdir(), "outside-"));
    temps.push(base, outside);
    process.env.HOOX_HOME = base;
    delete process.env.HOOX_REPO;

    const status = getRuntimeStatus(outside);
    expect(status.hooxHome).toBe(base);
    expect(status.repoPath).toBe(join(base, "repo"));
    expect(status.isSetupRoot).toBe(false);
    expect(status.runtime.source).toBe("none");
    expect(status.tuiEntry).toBeNull();
  });

  it("finds TUI entry when HOOX_REPO points at a setup root", () => {
    const root = mkdtempSync(join(tmpdir(), "setup-"));
    temps.push(root);
    writeFileSync(join(root, "wrangler.jsonc"), "{}\n");
    mkdirSync(join(root, "packages", "cli"), { recursive: true });
    writeFileSync(
      join(root, "packages", "cli", "package.json"),
      JSON.stringify({ name: "cli" })
    );
    mkdirSync(join(root, "packages", "tui", "src"), { recursive: true });
    const main = join(root, "packages", "tui", "src", "main.tsx");
    writeFileSync(main, "//\n");

    process.env.HOOX_REPO = root;
    const outside = mkdtempSync(join(tmpdir(), "outside-"));
    temps.push(outside);

    const status = getRuntimeStatus(outside);
    expect(status.runtime.source).toBe("env");
    expect(status.runtime.root).toBe(root);
    expect(status.tuiEntry).toBe(main);
  });
});
