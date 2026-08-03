/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { registerSecretsCommand } from "./secrets-command.js";
import { registerConfigCommand } from "../config/config-command.js";

describe("registerSecretsCommand (top-level, in-process)", () => {
  let tmp: string;
  let prevCwd: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "hoox-secrets-"));
    prevCwd = process.cwd();
    process.chdir(tmp);
    writeFileSync(
      "wrangler.jsonc",
      JSON.stringify({
        workers: {
          "trade-worker": {
            enabled: true,
            path: "workers/trade-worker",
            secrets: ["API_KEY", "API_SECRET"],
          },
          hoox: {
            enabled: true,
            path: "workers/hoox-worker",
            secrets: ["SECRET_ONE"],
          },
        },
      })
    );
  });

  afterEach(() => {
    process.chdir(prevCwd);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("registers list/set/delete/sync without spawning hoox", () => {
    const program = new Command();
    registerSecretsCommand(program);
    const secrets = program.commands.find((c) => c.name() === "secrets");
    expect(secrets).toBeDefined();
    const sub = secrets!.commands.map((c) => c.name()).sort();
    expect(sub).toEqual(["delete", "list", "set", "sync"]);
  });

  it("lists secrets in-process (same behavior as config secrets list)", async () => {
    const program = new Command();
    program.exitOverride();
    registerSecretsCommand(program);

    const chunks: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    try {
      await program.parseAsync(["secrets", "list", "trade-worker"], {
        from: "user",
      });
    } finally {
      process.stdout.write = origWrite;
    }

    const out = chunks.join("");
    expect(out).toContain("API_KEY");
    expect(out).toContain("API_SECRET");
  });

  it("parity: top-level secrets list matches config secrets list", async () => {
    async function capture(args: string[]): Promise<string> {
      const program = new Command();
      program.exitOverride();
      registerSecretsCommand(program);
      registerConfigCommand(program);
      const chunks: string[] = [];
      const origWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = ((chunk: string | Uint8Array) => {
        chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
        return true;
      }) as typeof process.stdout.write;
      try {
        await program.parseAsync(args, { from: "user" });
      } finally {
        process.stdout.write = origWrite;
      }
      return chunks.join("");
    }

    const top = await capture(["secrets", "list", "trade-worker"]);
    const viaConfig = await capture([
      "config",
      "secrets",
      "list",
      "trade-worker",
    ]);
    expect(top).toContain("API_KEY");
    expect(viaConfig).toContain("API_KEY");
    // Same secret names surface from both entry points
    expect(top.includes("API_SECRET")).toBe(viaConfig.includes("API_SECRET"));
  });
});
