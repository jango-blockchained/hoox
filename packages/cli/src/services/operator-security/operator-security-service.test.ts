/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test";
import {
  collectSecurityHygiene,
  classifyOperatorProbeStatus,
  probeOperatorManagement,
  detectCloudflared,
  formatProbeSecurityLines,
  securityChecksFailed,
} from "./operator-security-service.js";
import type { OperatorTransportProfile } from "@jango-blockchained/hoox-shared";

const baseProfile = (
  over: Partial<OperatorTransportProfile> = {}
): OperatorTransportProfile => ({
  transport: "public",
  apiBase: "https://mgmt.example.com",
  bearerToken: "tok",
  accessClientId: "",
  accessClientSecret: "",
  ...over,
});

describe("collectSecurityHygiene", () => {
  it("reports unset credentials as warn/info", () => {
    const lines = collectSecurityHygiene({});
    const bearer = lines.find((l) => l.id === "operator-bearer");
    expect(bearer?.severity).toBe("warn");
    const access = lines.find((l) => l.id === "access-service-token");
    expect(access?.severity).toBe("info");
  });

  it("reports set bearer as ok", () => {
    const lines = collectSecurityHygiene({ HOOX_API_TOKEN: "secret" });
    expect(lines.find((l) => l.id === "operator-bearer")?.severity).toBe("ok");
  });

  it("never embeds secret values", () => {
    const lines = collectSecurityHygiene({
      HOOX_API_TOKEN: "super-secret-token-value",
      CF_ACCESS_CLIENT_SECRET: "access-secret-xyz",
    });
    const joined = lines.map((l) => l.detail).join(" ");
    expect(joined).not.toContain("super-secret-token-value");
    expect(joined).not.toContain("access-secret-xyz");
  });
});

describe("classifyOperatorProbeStatus", () => {
  it("classifies 200 as ok/healthy", () => {
    const r = classifyOperatorProbeStatus(200);
    expect(r.classification).toBe("ok");
    expect(r.healthy).toBe(true);
  });

  it("classifies 401 as auth_required", () => {
    expect(classifyOperatorProbeStatus(401).classification).toBe(
      "auth_required"
    );
  });

  it("classifies 302 as access_gate", () => {
    expect(classifyOperatorProbeStatus(302).classification).toBe("access_gate");
  });

  it("classifies 404 as not_found", () => {
    expect(classifyOperatorProbeStatus(404).classification).toBe("not_found");
  });
});

describe("probeOperatorManagement", () => {
  it("sends operator headers and classifies response", async () => {
    let seenUrl = "";
    let seenAuth = "";
    const result = await probeOperatorManagement({
      profile: baseProfile(),
      fetchImpl: async (url, init) => {
        seenUrl = url;
        seenAuth =
          (init?.headers as Record<string, string>).Authorization ?? "";
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      },
    });
    expect(seenUrl).toBe("https://mgmt.example.com/v1/health");
    expect(seenAuth).toBe("Bearer tok");
    expect(result.healthy).toBe(true);
    expect(result.classification).toBe("ok");
  });

  it("anonymous probe omits Authorization", async () => {
    let seenAuth: string | undefined = "present";
    await probeOperatorManagement({
      profile: baseProfile(),
      anonymous: true,
      fetchImpl: async (_url, init) => {
        seenAuth = (init?.headers as Record<string, string>).Authorization;
        return new Response("", { status: 302 });
      },
    });
    expect(seenAuth).toBeUndefined();
  });

  it("maps network errors", async () => {
    const result = await probeOperatorManagement({
      profile: baseProfile(),
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    });
    expect(result.classification).toBe("network");
    expect(result.status).toBeNull();
  });
});

describe("detectCloudflared", () => {
  it("reports missing binary", async () => {
    const s = await detectCloudflared({
      whichImpl: async () => null,
    });
    expect(s.installed).toBe(false);
    expect(s.detail).toContain("not found");
  });

  it("reports path and version when present", async () => {
    const s = await detectCloudflared({
      whichImpl: async () => "/usr/local/bin/cloudflared",
      versionImpl: async () => "cloudflared version 2024.1.0",
    });
    expect(s.installed).toBe(true);
    expect(s.path).toBe("/usr/local/bin/cloudflared");
    expect(s.version).toContain("2024.1.0");
  });
});

describe("formatProbeSecurityLines / securityChecksFailed", () => {
  it("warns when anonymous gets 200", () => {
    const lines = formatProbeSecurityLines(
      {
        url: "https://x/v1/health",
        status: 200,
        classification: "ok",
        detail: "ok",
        healthy: true,
      },
      {
        url: "https://x/v1/health",
        status: 200,
        classification: "ok",
        detail: "ok",
        healthy: true,
      }
    );
    expect(lines.some((l) => l.id === "probe-anonymous-open")).toBe(true);
  });

  it("securityChecksFailed true when hardFail error", () => {
    expect(
      securityChecksFailed([
        {
          id: "x",
          severity: "error",
          label: "x",
          detail: "y",
          hardFail: true,
        },
      ])
    ).toBe(true);
    expect(
      securityChecksFailed([
        { id: "x", severity: "ok", label: "x", detail: "y" },
      ])
    ).toBe(false);
  });
});
