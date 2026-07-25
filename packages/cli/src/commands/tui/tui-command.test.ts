import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync } from "node:fs";
import {
  resolveTUIEntry,
  resolveTuiLaunchConfig,
  resolveTuiAuthStatus,
  resolveTuiAuthToken,
  formatTuiAuthBanner,
  assertRemoteAuthReady,
  hasAccessServiceToken,
} from "./tui-command.js";
import {
  findHooxSetupRoot,
  getTuiEntryCandidates,
} from "@jango-blockchained/hoox-shared";
import { CLIError } from "../../utils/errors.js";

describe("resolveTUIEntry", () => {
  it("finds a monorepo TUI entry that exists on disk", () => {
    const entry = resolveTUIEntry();
    expect(typeof entry).toBe("string");
    expect(entry.length).toBeGreaterThan(0);
    expect(existsSync(entry)).toBe(true);
    expect(entry).toMatch(/main\.(tsx|js|ts)$/);
  });

  it("prefers packages/tui paths", () => {
    const entry = resolveTUIEntry();
    // In this monorepo we always resolve into packages/tui
    expect(entry.includes("tui")).toBe(true);
  });

  it("resolves under the local setup root when present", () => {
    const root = findHooxSetupRoot(process.cwd());
    if (!root) return; // not running inside monorepo — skip soft
    const candidates = getTuiEntryCandidates(root);
    const entry = resolveTUIEntry();
    expect(
      candidates.some((c) => entry === c || entry.endsWith("main.tsx"))
    ).toBe(true);
    expect(entry.includes(root) || entry.includes("tui")).toBe(true);
  });
});

describe("resolveTuiLaunchConfig", () => {
  const ORIGINAL_API_URL = process.env.HOOX_API_URL;

  beforeEach(() => {
    delete process.env.HOOX_API_URL;
  });

  afterEach(() => {
    if (ORIGINAL_API_URL === undefined) delete process.env.HOOX_API_URL;
    else process.env.HOOX_API_URL = ORIGINAL_API_URL;
  });

  it("defaults to local mode on localhost:8787", () => {
    const cfg = resolveTuiLaunchConfig({});
    expect(cfg.tuiMode).toBe("local");
    expect(cfg.apiBase).toBe("http://localhost:8787");
    expect(cfg.source).toBe("local-default");
  });

  it("uses HOOX_API_URL in local mode when set", () => {
    process.env.HOOX_API_URL = "http://127.0.0.1:9999";
    const cfg = resolveTuiLaunchConfig({});
    expect(cfg.tuiMode).toBe("local");
    expect(cfg.apiBase).toBe("http://127.0.0.1:9999");
    expect(cfg.source).toBe("local-default");
  });

  it("uses --api-url as remote mode and strips trailing slashes", () => {
    const cfg = resolveTuiLaunchConfig({
      apiUrl: "https://hoox.example.com///",
    });
    expect(cfg.tuiMode).toBe("remote");
    expect(cfg.apiBase).toBe("https://hoox.example.com");
    expect(cfg.source).toBe("api-url");
  });

  it("--api-url takes precedence over --remote", () => {
    const cfg = resolveTuiLaunchConfig(
      { apiUrl: "https://explicit.example.com", remote: true },
      () => "https://should-not-be-used.workers.dev"
    );
    expect(cfg.tuiMode).toBe("remote");
    expect(cfg.apiBase).toBe("https://explicit.example.com");
    expect(cfg.source).toBe("api-url");
  });

  it("resolves --remote via gateway URL helper", () => {
    const cfg = resolveTuiLaunchConfig(
      { remote: true },
      () => "https://hoox.cryptolinx.workers.dev/"
    );
    expect(cfg.tuiMode).toBe("remote");
    expect(cfg.apiBase).toBe("https://hoox.cryptolinx.workers.dev");
    expect(cfg.source).toBe("remote-gateway");
  });

  it("throws CLIError when --remote cannot resolve a gateway", () => {
    expect(() =>
      resolveTuiLaunchConfig({ remote: true }, () => {
        throw new Error("no creds");
      })
    ).toThrow(CLIError);

    try {
      resolveTuiLaunchConfig({ remote: true }, () => {
        throw new Error("no creds");
      });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CLIError);
      expect((err as CLIError).message).toContain("HOOX_GATEWAY_URL");
      expect((err as CLIError).message).toContain("--api-url");
    }
  });
});

describe("resolveTuiAuthStatus / token", () => {
  const ORIGINAL = process.env.HOOX_API_TOKEN;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.HOOX_API_TOKEN;
    else process.env.HOOX_API_TOKEN = ORIGINAL;
  });

  it("prefers --token over env", () => {
    process.env.HOOX_API_TOKEN = "from-env";
    const status = resolveTuiAuthStatus({ token: "from-flag" });
    expect(status).toEqual({ hasToken: true, source: "flag" });
    expect(resolveTuiAuthToken({ token: "from-flag" })).toBe("from-flag");
  });

  it("reads env when no flag", () => {
    process.env.HOOX_API_TOKEN = "from-env";
    const status = resolveTuiAuthStatus({});
    expect(status).toEqual({ hasToken: true, source: "env" });
    expect(resolveTuiAuthToken({})).toBe("from-env");
  });

  it("reports none when empty", () => {
    delete process.env.HOOX_API_TOKEN;
    expect(resolveTuiAuthStatus({})).toEqual({
      hasToken: false,
      source: "none",
    });
    expect(resolveTuiAuthToken({})).toBe("");
  });

  it("banner never embeds the secret", () => {
    const banner = formatTuiAuthBanner(
      { hasToken: true, source: "env" },
      "remote"
    );
    expect(banner).toContain("set");
    expect(banner).not.toContain("from-env");
    expect(
      formatTuiAuthBanner({ hasToken: false, source: "none" }, "remote")
    ).toContain("missing");
  });
});

describe("assertRemoteAuthReady / hasAccessServiceToken", () => {
  const ORIGINAL_ID = process.env.CF_ACCESS_CLIENT_ID;
  const ORIGINAL_SECRET = process.env.CF_ACCESS_CLIENT_SECRET;

  afterEach(() => {
    if (ORIGINAL_ID === undefined) delete process.env.CF_ACCESS_CLIENT_ID;
    else process.env.CF_ACCESS_CLIENT_ID = ORIGINAL_ID;
    if (ORIGINAL_SECRET === undefined)
      delete process.env.CF_ACCESS_CLIENT_SECRET;
    else process.env.CF_ACCESS_CLIENT_SECRET = ORIGINAL_SECRET;
  });

  it("allows local mode without credentials", () => {
    const gate = assertRemoteAuthReady({
      tuiMode: "local",
      hasToken: false,
    });
    expect(gate.ok).toBe(true);
  });

  it("blocks remote without token, access, or allow-insecure", () => {
    const gate = assertRemoteAuthReady({
      tuiMode: "remote",
      hasToken: false,
      hasAccess: false,
      allowInsecure: false,
    });
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.reason).toContain("fail-closed");
      expect(gate.reason).toContain("HOOX_API_TOKEN");
      expect(gate.reason).toContain("--allow-insecure");
    }
  });

  it("allows remote with Bearer", () => {
    expect(
      assertRemoteAuthReady({
        tuiMode: "remote",
        hasToken: true,
      })
    ).toEqual({ ok: true, method: "bearer" });
  });

  it("allows remote with Access service token", () => {
    expect(
      assertRemoteAuthReady({
        tuiMode: "remote",
        hasToken: false,
        hasAccess: true,
      })
    ).toEqual({ ok: true, method: "access" });
  });

  it("allows remote with --allow-insecure", () => {
    expect(
      assertRemoteAuthReady({
        tuiMode: "remote",
        hasToken: false,
        allowInsecure: true,
      })
    ).toEqual({ ok: true, method: "allow-insecure" });
  });

  it("hasAccessServiceToken requires both env vars", () => {
    delete process.env.CF_ACCESS_CLIENT_ID;
    delete process.env.CF_ACCESS_CLIENT_SECRET;
    expect(hasAccessServiceToken()).toBe(false);

    process.env.CF_ACCESS_CLIENT_ID = "client-id";
    expect(hasAccessServiceToken()).toBe(false);

    process.env.CF_ACCESS_CLIENT_SECRET = "client-secret";
    expect(hasAccessServiceToken()).toBe(true);
  });
});
