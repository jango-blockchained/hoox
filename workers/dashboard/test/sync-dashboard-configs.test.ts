/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We can't easily import the sync script as a module (it uses process.cwd and
// process.exit at module scope), so we test it by spawning it as a subprocess.
import { spawnSync } from "node:child_process";

const SCRIPT = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "scripts",
  "sync-dashboard-configs.ts"
);

function run(
  args: string[],
  cwd: string
): { status: number; stdout: string; stderr: string } {
  const result = spawnSync("bun", ["run", SCRIPT, ...args], {
    cwd,
    encoding: "utf8",
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("sync-dashboard-configs.ts", () => {
  let tmp: string;
  let workersDir: string;
  let publicDir: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "sync-test-"));
    workersDir = join(tmp, "workers");
    publicDir = join(tmp, "workers/dashboard/public/workers");
    mkdirSync(workersDir, { recursive: true });
    mkdirSync(publicDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("syncs a valid worker jsonc to public/workers/", () => {
    mkdirSync(join(workersDir, "hoox"), { recursive: true });
    writeFileSync(
      join(workersDir, "hoox/dashboard.jsonc"),
      JSON.stringify(
        {
          display_name: "Test Worker",
          sections: {
            global: {
              title: "Global",
              fields: { enabled: true },
            },
          },
        },
        null,
        2
      )
    );

    const result = run([], tmp);
    expect(result.status).toBe(0);
    const out = join(publicDir, "hoox.jsonc");
    expect(existsSync(out)).toBe(true);
    const parsed = JSON.parse(readFileSync(out, "utf8"));
    expect(parsed.display_name).toBe("Test Worker");
  });

  test("removes stale public/workers/ files that have no source", () => {
    mkdirSync(join(workersDir, "hoox"), { recursive: true });
    writeFileSync(
      join(workersDir, "hoox/dashboard.jsonc"),
      JSON.stringify({ display_name: "Real Worker" }, null, 2)
    );
    writeFileSync(join(publicDir, "stale-worker.jsonc"), "{ not used }");

    const result = run([], tmp);
    expect(result.status).toBe(0);
    expect(existsSync(join(publicDir, "stale-worker.jsonc"))).toBe(false);
    expect(existsSync(join(publicDir, "hoox.jsonc"))).toBe(true);
  });

  test("exits non-zero on malformed jsonc", () => {
    mkdirSync(join(workersDir, "bad"), { recursive: true });
    writeFileSync(
      join(workersDir, "bad/dashboard.jsonc"),
      "{ this is not valid json"
    );

    const result = run([], tmp);
    expect(result.status).toBe(1);
  });

  test("handles JSONC trailing commas and line comments", () => {
    mkdirSync(join(workersDir, "jsonc"), { recursive: true });
    // Trailing comma + line comment + URL in string (the tricky case)
    const content = `{
      // header comment
      "display_name": "JSONC Worker",
      "sections": {
        "webhook": {
          "title": "Webhooks",
          "fields": {
            "allowed_ips": "https://example.com/path",
          },
        },
      },
    }
    `;
    writeFileSync(join(workersDir, "jsonc/dashboard.jsonc"), content);

    const result = run([], tmp);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(
      readFileSync(join(publicDir, "jsonc.jsonc"), "utf8")
    );
    expect(parsed.display_name).toBe("JSONC Worker");
    expect(parsed.sections.webhook.fields.allowed_ips).toBe(
      "https://example.com/path"
    );
  });
});
