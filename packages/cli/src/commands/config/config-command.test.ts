/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for `config-command.ts` — the `hoox config` command group.
 *
 * Tests verify:
 *  - Subcommand registration (show, set, secrets, keys)
 *  - Output formatting (human-readable vs --json)
 *  - Error handling for missing config files, invalid paths, etc.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Command } from "commander";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { registerConfigCommand } from "./config-command.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid wrangler.jsonc content for testing. */
const VALID_CONFIG = `{
  "global": {
    "cloudflare_account_id": "abc123",
    "cloudflare_api_token": "token-placeholder"
  },
  "workers": {
    "d1-worker": {
      "enabled": true,
      "path": "workers/d1-worker",
      "vars": {
        "database_name": "my-database"
      },
      "secrets": ["SECRET_ONE"]
    },
    "trade-worker": {
      "enabled": true,
      "path": "workers/trade-worker",
      "vars": {},
      "secrets": ["API_KEY", "API_SECRET"]
    }
  }
}`;

/** Create a real wrangler.jsonc in a temp dir and cd into it. */
function setupTempConfig(name = "hoox-cli-test"): string {
  const dir = mkdtempSync(join(tmpdir(), `${name}-`));
  writeFileSync(join(dir, "wrangler.jsonc"), VALID_CONFIG);
  return dir;
}

/** Capture all writes to process.stdout for assertion. */
class OutputCapture {
  private lines: string[] = [];
  private original: typeof process.stdout.write;

  constructor() {
    this.original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array, cb?: () => void) => {
      const str =
        typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
      this.lines.push(str);
      if (cb) cb();
      return true;
    }) as typeof process.stdout.write;
  }

  text(): string {
    return this.lines.join("");
  }

  json<T = unknown>(): T {
    const text = this.text();
    // Find the first JSON object/array in the output
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (
        (trimmed.startsWith("{") || trimmed.startsWith("[")) &&
        (trimmed.endsWith("}") || trimmed.endsWith("]"))
      ) {
        try {
          return JSON.parse(trimmed) as T;
        } catch {
          // try next line
        }
      }
    }
    // Fallback: try parsing full output
    return JSON.parse(text) as T;
  }

  restore(): void {
    process.stdout.write = this.original;
  }
}

/** Create a fresh Commander program with global options for testing. */
function makeProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.option("--json", "JSON output");
  program.option("--quiet", "Quiet mode");
  return program;
}

/**
 * Parse args and wait for all async actions to complete.
 * Uses Commander's internal handling: when exitOverride is set,
 * async action rejections surface as errors.
 */
async function runCommand(
  program: Command,
  args: string[]
): Promise<OutputCapture> {
  const capture = new OutputCapture();
  try {
    // Commander v13 parseAsync waits for async actions
    await (
      program as Command & {
        parseAsync?: (a: string[], o: { from: string }) => Promise<void>;
      }
    ).parseAsync?.([...args], { from: "user" });

    // Fallback: if parseAsync isn't available, parse synchronously and wait
    if (
      typeof (program as Command & { parseAsync?: unknown }).parseAsync !==
      "function"
    ) {
      program.parse([...args], { from: "user" });
      // Give async actions a tick to complete
      await new Promise((r) => setTimeout(r, 50));
    }
  } catch (_err) {
    // Commander throws on help, version, etc. — capture handles it
  }
  return capture;
}

// ---------------------------------------------------------------------------
// Tests: Command registration
// ---------------------------------------------------------------------------

describe("registerConfigCommand", () => {
  it("registers the `config` command on the program", () => {
    const program = makeProgram();
    registerConfigCommand(program);

    const cmd = program.commands.find((c) => c.name() === "config");
    expect(cmd).toBeDefined();
    expect(cmd?.summary()).toContain("Manage wrangler.jsonc configuration");
  });

  it("registers the `show` subcommand", () => {
    const program = makeProgram();
    registerConfigCommand(program);

    const configCmd = program.commands.find((c) => c.name() === "config");
    const showCmd = configCmd?.commands.find((c) => c.name() === "show");
    expect(showCmd).toBeDefined();
    expect(showCmd?.description()).toContain("Display");
  });

  it("registers the `set` subcommand with key and value arguments", () => {
    const program = makeProgram();
    registerConfigCommand(program);

    const configCmd = program.commands.find((c) => c.name() === "config");
    const setCmd = configCmd?.commands.find((c) => c.name() === "set");
    expect(setCmd).toBeDefined();
    expect(setCmd?.description()).toContain("Update");
  });

  it("registers the `secrets` subcommand group with all sub-subcommands", () => {
    const program = makeProgram();
    registerConfigCommand(program);

    const configCmd = program.commands.find((c) => c.name() === "config");
    const secretsCmd = configCmd?.commands.find((c) => c.name() === "secrets");
    expect(secretsCmd).toBeDefined();
    expect(secretsCmd?.description()).toContain("Cloudflare");

    const subNames = secretsCmd?.commands.map((c) => c.name()) ?? [];
    expect(subNames).toContain("list");
    expect(subNames).toContain("set");
    expect(subNames).toContain("delete");
    expect(subNames).toContain("sync");
  });

  it("registers the `keys` subcommand group with generate and list", () => {
    const program = makeProgram();
    registerConfigCommand(program);

    const configCmd = program.commands.find((c) => c.name() === "config");
    const keysCmd = configCmd?.commands.find((c) => c.name() === "keys");
    expect(keysCmd).toBeDefined();
    expect(keysCmd?.description()).toContain("auth");

    const subNames = keysCmd?.commands.map((c) => c.name()) ?? [];
    expect(subNames).toContain("generate");
    expect(subNames).toContain("list");
  });
});

// ---------------------------------------------------------------------------
// Tests: config show
// ---------------------------------------------------------------------------

describe("config show", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = setupTempConfig();
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("displays global config as key-value pairs in human-readable mode", async () => {
    const program = makeProgram();
    registerConfigCommand(program);

    const capture = await runCommand(program, ["config", "show"]);
    const text = capture.text();
    capture.restore();

    expect(text).toContain("Global Configuration");
    expect(text).toContain("cloudflare_account_id");
    expect(text).toContain("abc123");
    expect(text).toContain("Workers");
    expect(text).toContain("d1-worker");
  });

  it("outputs JSON when --json flag is set", async () => {
    const program = makeProgram();
    registerConfigCommand(program);

    const capture = await runCommand(program, ["--json", "config", "show"]);
    const json = capture.json<{
      global?: Record<string, string>;
      workers?: Record<string, unknown>;
    }>();
    capture.restore();

    expect(json.global).toBeDefined();
    expect(json.global?.cloudflare_account_id).toBe("abc123");
    expect(json.workers).toBeDefined();
  });

  it("handles missing config file gracefully", async () => {
    // Create empty temp dir without wrangler.jsonc
    const emptyDir = mkdtempSync(join(tmpdir(), "empty-config-"));
    process.chdir(emptyDir);

    const program = makeProgram();
    registerConfigCommand(program);

    const capture = await runCommand(program, ["config", "show"]);
    const text = capture.text();
    capture.restore();

    process.chdir(tmpDir);
    rmSync(emptyDir, { recursive: true, force: true });

    expect(text).toContain("[config]");
  });
});

// ---------------------------------------------------------------------------
// Tests: config set
// ---------------------------------------------------------------------------

describe("config set", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = setupTempConfig();
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("updates a global config value", async () => {
    const program = makeProgram();
    registerConfigCommand(program);

    const capture = await runCommand(program, [
      "config",
      "set",
      "global.cloudflare_account_id",
      "new-id-456",
    ]);
    const text = capture.text();
    capture.restore();

    // Read the file back to verify the update
    const updated = await Bun.file("wrangler.jsonc").text();
    const parsed = JSON.parse(updated) as {
      global: { cloudflare_account_id: string };
    };

    expect(text).toContain("Updated");
    expect(parsed.global.cloudflare_account_id).toBe("new-id-456");
  });

  it("updates a nested worker var value", async () => {
    const program = makeProgram();
    registerConfigCommand(program);

    const capture = await runCommand(program, [
      "config",
      "set",
      "workers.d1-worker.vars.database_name",
      "new-db",
    ]);
    capture.restore();

    const updated = await Bun.file("wrangler.jsonc").text();
    const parsed = JSON.parse(updated) as {
      workers: Record<string, { vars: Record<string, string> }>;
    };

    expect(parsed.workers["d1-worker"].vars.database_name).toBe("new-db");
  });

  it("coerces boolean strings to booleans", async () => {
    const program = makeProgram();
    registerConfigCommand(program);

    const capture = await runCommand(program, [
      "config",
      "set",
      "workers.d1-worker.enabled",
      "false",
    ]);
    capture.restore();

    const updated = await Bun.file("wrangler.jsonc").text();
    const parsed = JSON.parse(updated) as {
      workers: Record<string, { enabled: boolean }>;
    };

    expect(parsed.workers["d1-worker"].enabled).toBe(false);
  });

  it("coerces numeric strings to numbers", async () => {
    const program = makeProgram();
    registerConfigCommand(program);

    const capture = await runCommand(program, [
      "config",
      "set",
      "workers.trade-worker.vars.max_retries",
      "5",
    ]);
    capture.restore();

    const updated = await Bun.file("wrangler.jsonc").text();
    const parsed = JSON.parse(updated) as {
      workers: Record<string, { vars: Record<string, number> }>;
    };

    expect(parsed.workers["trade-worker"].vars.max_retries).toBe(5);
  });

  it("reports error for invalid key paths", async () => {
    const program = makeProgram();
    registerConfigCommand(program);

    const capture = await runCommand(program, [
      "config",
      "set",
      "nonexistent.deep.path",
      "value",
    ]);
    const text = capture.text();
    capture.restore();

    // The command should output an error message
    expect(text.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: config secrets list (no Cloudflare API needed)
// ---------------------------------------------------------------------------

describe("config secrets", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = setupTempConfig();
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("lists secrets for all workers", async () => {
    const program = makeProgram();
    registerConfigCommand(program);

    const capture = await runCommand(program, ["config", "secrets", "list"]);
    const text = capture.text();
    capture.restore();

    expect(text).toContain("trade-worker");
    expect(text).toContain("API_KEY");
    expect(text).toContain("API_SECRET");
    expect(text).toContain("d1-worker");
    expect(text).toContain("SECRET_ONE");
  });

  it("lists secrets for a specific worker", async () => {
    const program = makeProgram();
    registerConfigCommand(program);

    const capture = await runCommand(program, [
      "config",
      "secrets",
      "list",
      "trade-worker",
    ]);
    const text = capture.text();
    capture.restore();

    expect(text).toContain("trade-worker");
    expect(text).toContain("API_KEY");
    expect(text).toContain("API_SECRET");
  });

  it("outputs JSON for secrets list when --json is set", async () => {
    const program = makeProgram();
    registerConfigCommand(program);

    const capture = await runCommand(program, [
      "--json",
      "config",
      "secrets",
      "list",
    ]);
    const json = capture.json<Record<string, string[]>>();
    capture.restore();

    expect(json["trade-worker"]).toBeDefined();
    expect(json["trade-worker"]).toContain("API_KEY");
  });

  it("shows message when no secrets declared on specific worker", async () => {
    const program = makeProgram();
    registerConfigCommand(program);

    const capture = await runCommand(program, [
      "config",
      "secrets",
      "list",
      "hoox",
    ]);
    const text = capture.text();
    capture.restore();

    // "hoox" is in the config but might not have secrets or may be missing
    expect(text.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: config keys
// ---------------------------------------------------------------------------

describe("config keys", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = setupTempConfig();
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("generates key files in .keys/ directory", async () => {
    const program = makeProgram();
    registerConfigCommand(program);

    const capture = await runCommand(program, ["config", "keys", "generate"]);
    const text = capture.text();
    capture.restore();

    expect(text).toContain("Generated");
    expect(text).toContain(".keys/");

    // Verify files were created
    const internalKeyFile = Bun.file(".keys/internal_key_binding.env");
    expect(await internalKeyFile.exists()).toBe(true);
    const content = await internalKeyFile.text();
    expect(content).toMatch(/^INTERNAL_KEY_BINDING=[a-f0-9]{64}\n$/);
  });

  it("lists generated key files", async () => {
    // First generate keys
    const prog1 = makeProgram();
    registerConfigCommand(prog1);
    const c1 = await runCommand(prog1, ["config", "keys", "generate"]);
    c1.restore();

    // Now list them
    const prog2 = makeProgram();
    registerConfigCommand(prog2);
    const capture = await runCommand(prog2, ["config", "keys", "list"]);
    const text = capture.text();
    capture.restore();

    expect(text).toContain("Key files");
    expect(text).toContain("****"); // Values are masked
  });

  it("handles missing .keys/ directory gracefully for list", async () => {
    const program = makeProgram();
    registerConfigCommand(program);

    const capture = await runCommand(program, ["config", "keys", "list"]);
    const text = capture.text();
    capture.restore();

    expect(text).toContain("No .keys/");
  });

  it("outputs JSON for keys list when --json is set", async () => {
    // First generate keys
    const prog1 = makeProgram();
    registerConfigCommand(prog1);
    const c1 = await runCommand(prog1, ["config", "keys", "generate"]);
    c1.restore();

    const prog2 = makeProgram();
    registerConfigCommand(prog2);
    const capture = await runCommand(prog2, [
      "--json",
      "config",
      "keys",
      "list",
    ]);
    const json = capture.json<{ keys: number; files: string[] }>();
    capture.restore();

    expect(json.keys).toBeGreaterThan(0);
    expect(Array.isArray(json.files)).toBe(true);
  });

  it("generates hex-formatted keys of expected length", async () => {
    const program = makeProgram();
    registerConfigCommand(program);

    const capture = await runCommand(program, ["config", "keys", "generate"]);
    capture.restore();

    const file = Bun.file(".keys/webhook_api_key_binding.env");
    expect(await file.exists()).toBe(true);
    const content = await file.text();
    const match = content.match(/^WEBHOOK_API_KEY_BINDING=([a-f0-9]+)\n$/);
    expect(match).not.toBeNull();
    // Service keys are 32 bytes = 64 hex chars
    expect(match![1].length).toBe(64);
  });
});
