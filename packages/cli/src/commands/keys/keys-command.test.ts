/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { registerKeysCommand } from "./keys-command.js";

describe("registerKeysCommand (top-level, in-process)", () => {
  let tmp: string;
  let prevCwd: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "hoox-keys-"));
    prevCwd = process.cwd();
    process.chdir(tmp);
  });

  afterEach(() => {
    process.chdir(prevCwd);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("registers generate and list subcommands", () => {
    const program = new Command();
    registerKeysCommand(program);
    const keys = program.commands.find((c) => c.name() === "keys");
    expect(keys).toBeDefined();
    const sub = keys!.commands.map((c) => c.name()).sort();
    expect(sub).toEqual(["generate", "list"]);
  });

  it("generates key files in-process without spawning hoox", async () => {
    const program = new Command();
    program.exitOverride();
    registerKeysCommand(program);

    await program.parseAsync(["keys", "generate"], { from: "user" });

    const internal = Bun.file(".keys/internal_key_binding.env");
    expect(await internal.exists()).toBe(true);
    const text = await internal.text();
    expect(text).toMatch(/^INTERNAL_KEY_BINDING=[0-9a-f]{64}\n$/);
  });

  it("lists keys after generate", async () => {
    const program = new Command();
    program.exitOverride();
    registerKeysCommand(program);

    await program.parseAsync(["keys", "generate"], { from: "user" });

    const chunks: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    try {
      await program.parseAsync(["keys", "list"], { from: "user" });
    } finally {
      process.stdout.write = origWrite;
    }

    const out = chunks.join("");
    expect(out).toContain("INTERNAL_KEY_BINDING");
    expect(out).toContain("****");
  });
});
