import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  devLog,
  getDevLogPath,
  isDevLogEnabled,
  resetDevLogForTests,
  tuiDevLog,
  redactSecretsInText,
  redactDevLogContext,
} from "./dev-log";

describe("dev-log", () => {
  const ORIGINAL_DEBUG = process.env.HOOX_DEBUG;
  const ORIGINAL_TUI_DEBUG = process.env.TUI_DEBUG;
  const ORIGINAL_HOOX_HOME = process.env.HOOX_HOME;
  let tempHooxHome: string;

  beforeEach(async () => {
    resetDevLogForTests();
    // Prefer HOOX_HOME override (highest priority in getHooxHome) for isolation
    tempHooxHome = await mkdtemp(join(tmpdir(), "hoox-dev-log-"));
    process.env.HOOX_HOME = tempHooxHome;
    delete process.env.HOOX_DEBUG;
    delete process.env.TUI_DEBUG;
  });

  afterEach(async () => {
    resetDevLogForTests();
    if (ORIGINAL_DEBUG === undefined) delete process.env.HOOX_DEBUG;
    else process.env.HOOX_DEBUG = ORIGINAL_DEBUG;
    if (ORIGINAL_TUI_DEBUG === undefined) delete process.env.TUI_DEBUG;
    else process.env.TUI_DEBUG = ORIGINAL_TUI_DEBUG;
    if (ORIGINAL_HOOX_HOME === undefined) delete process.env.HOOX_HOME;
    else process.env.HOOX_HOME = ORIGINAL_HOOX_HOME;
    await rm(tempHooxHome, { recursive: true, force: true });
  });

  it("is disabled by default", () => {
    expect(isDevLogEnabled()).toBe(false);
  });

  it("enables when HOOX_DEBUG=1", () => {
    process.env.HOOX_DEBUG = "1";
    resetDevLogForTests();
    expect(isDevLogEnabled()).toBe(true);
  });

  it("enables when TUI_DEBUG=true", () => {
    process.env.TUI_DEBUG = "true";
    resetDevLogForTests();
    expect(isDevLogEnabled()).toBe(true);
  });

  it("no-ops when disabled (does not create log file)", async () => {
    await devLog("info", "test", "should not write");
    const path = getDevLogPath();
    expect(path.startsWith(tempHooxHome)).toBe(true);
    let exists = true;
    try {
      await readFile(path, "utf8");
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });

  it("appends JSON lines when enabled", async () => {
    process.env.HOOX_DEBUG = "1";
    resetDevLogForTests();

    await tuiDevLog.info("startup", "TUI booting", {
      mode: "local",
      apiUrl: "http://localhost:8787",
    });
    await tuiDevLog.debug("api", "fetchWorkers", { path: "/workers" });

    const path = getDevLogPath();
    expect(path.startsWith(tempHooxHome)).toBe(true);
    const raw = await readFile(path, "utf8");
    const lines = raw.trim().split("\n");
    expect(lines.length).toBe(2);

    const first = JSON.parse(lines[0]!) as {
      level: string;
      scope: string;
      message: string;
      context: { mode: string; apiUrl: string };
    };
    expect(first.level).toBe("info");
    expect(first.scope).toBe("startup");
    expect(first.message).toBe("TUI booting");
    expect(first.context.mode).toBe("local");
    expect(first.context.apiUrl).toBe("http://localhost:8787");
  });

  it("redacts secret-looking context keys", async () => {
    process.env.HOOX_DEBUG = "1";
    resetDevLogForTests();

    await devLog("info", "auth", "token present", {
      apiToken: "super-secret-value",
      path: "/health",
    });

    const raw = await readFile(getDevLogPath(), "utf8");
    const lines = raw
      .trim()
      .split("\n")
      .filter((l) => l.length > 0);
    expect(lines.length).toBe(1);
    const entry = JSON.parse(lines[0]!) as {
      context: { apiToken: string; path: string };
    };
    expect(entry.context.apiToken).toBe("[redacted]");
    expect(entry.context.path).toBe("/health");
    expect(raw).not.toContain("super-secret-value");
  });

  it("redacts nested secret keys and message Bearer tokens", async () => {
    process.env.HOOX_DEBUG = "1";
    resetDevLogForTests();

    await devLog(
      "warn",
      "http",
      "Authorization: Bearer super-secret-value failed",
      {
        headers: { authorization: "Bearer super-secret-value" },
        nested: { client_secret: "access-secret-xyz" },
        path: "/workers",
      }
    );

    const raw = await readFile(getDevLogPath(), "utf8");
    expect(raw).not.toContain("super-secret-value");
    expect(raw).not.toContain("access-secret-xyz");
    expect(raw).toContain("[redacted]");
  });

  it("redactSecretsInText scrubs env-style assignments", () => {
    const scrubbed = redactSecretsInText(
      "HOOX_API_TOKEN=abc123 CF_ACCESS_CLIENT_SECRET=xyz Authorization: Bearer tok12345678"
    );
    expect(scrubbed).not.toContain("abc123");
    expect(scrubbed).not.toContain("xyz");
    expect(scrubbed).not.toContain("tok12345678");
    expect(scrubbed).toContain("HOOX_API_TOKEN=[redacted]");
  });

  it("redactDevLogContext redacts nested client_secret", () => {
    const out = redactDevLogContext({
      ok: true,
      auth: { client_secret: "s3cret", mode: "access" },
    });
    expect(out).toEqual({
      ok: true,
      auth: { client_secret: "[redacted]", mode: "access" },
    });
  });
});
