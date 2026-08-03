/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test";
import {
  classifyConnectionError,
  formatAuthBanner,
  getApiBase,
  getApiHost,
  getSettingsConnectionSnapshot,
  getTuiMode,
  hasApiToken,
  resolveTuiConnectionEnv,
  shouldUseCliFallback,
} from "./tui-connection";

describe("tui-connection", () => {
  describe("getTuiMode", () => {
    it("defaults to local", () => {
      expect(getTuiMode({})).toBe("local");
    });
    it("reads remote", () => {
      expect(getTuiMode({ HOOX_TUI_MODE: "remote" })).toBe("remote");
    });
  });

  describe("getApiBase / getApiHost", () => {
    it("defaults to localhost:8787", () => {
      expect(getApiBase({})).toBe("http://localhost:8787");
      expect(getApiHost(getApiBase({}))).toBe("localhost:8787");
    });
    it("strips trailing slashes", () => {
      expect(getApiBase({ HOOX_API_URL: "https://gw.example.com///" })).toBe(
        "https://gw.example.com"
      );
    });
  });

  describe("hasApiToken", () => {
    it("is false when empty", () => {
      expect(hasApiToken({})).toBe(false);
      expect(hasApiToken({ HOOX_API_TOKEN: "  " })).toBe(false);
    });
    it("is true when set", () => {
      expect(hasApiToken({ HOOX_API_TOKEN: "secret" })).toBe(true);
    });
  });

  describe("shouldUseCliFallback", () => {
    it("allows CLI only in local mode", () => {
      expect(shouldUseCliFallback("local")).toBe(true);
      expect(shouldUseCliFallback("remote")).toBe(false);
    });
  });

  describe("resolveTuiConnectionEnv", () => {
    it("builds a remote snapshot", () => {
      const env = resolveTuiConnectionEnv({
        HOOX_TUI_MODE: "remote",
        HOOX_API_URL: "https://hoox.example.workers.dev",
        HOOX_API_TOKEN: "tok",
      });
      expect(env.mode).toBe("remote");
      expect(env.apiHost).toBe("hoox.example.workers.dev");
      expect(env.hasToken).toBe(true);
      expect(env.allowCliFallback).toBe(false);
    });
  });

  describe("classifyConnectionError", () => {
    it("detects auth failures", () => {
      expect(classifyConnectionError("Authentication failed (HTTP 401)")).toBe(
        "auth"
      );
      expect(classifyConnectionError("HTTP 403: Forbidden")).toBe("auth");
    });
    it("detects rate limits", () => {
      expect(classifyConnectionError("API rate limited — backing off")).toBe(
        "rate-limit"
      );
    });
    it("detects network errors", () => {
      expect(
        classifyConnectionError("Network request failed: ECONNREFUSED")
      ).toBe("network");
    });
    it("unknown for empty", () => {
      expect(classifyConnectionError(null)).toBe("unknown");
    });
  });

  describe("formatAuthBanner", () => {
    it("describes missing remote token", () => {
      expect(formatAuthBanner(false, "remote")).toContain("missing");
      expect(formatAuthBanner(true, "remote")).toContain("set");
    });
  });

  describe("getSettingsConnectionSnapshot", () => {
    it("defaults to local/public with no auth", () => {
      const snap = getSettingsConnectionSnapshot({});
      expect(snap.mode).toBe("local");
      expect(snap.transport).toBe("public");
      expect(snap.authSummary).toBe("none");
      expect(snap.apiHost).toBe("localhost:8787");
      expect(snap.hint).toContain("hx config transport");
    });

    it("reports remote + Bearer without leaking token", () => {
      const snap = getSettingsConnectionSnapshot({
        HOOX_TUI_MODE: "remote",
        HOOX_API_URL: "https://mgmt.example.com",
        HOOX_API_TOKEN: "super-secret",
      });
      expect(snap.mode).toBe("remote");
      expect(snap.apiHost).toBe("mgmt.example.com");
      expect(snap.authSummary).toBe("Bearer");
      expect(JSON.stringify(snap)).not.toContain("super-secret");
    });

    it("uses config transport fallback when env unset", () => {
      const snap = getSettingsConnectionSnapshot(
        {},
        { transport: "access", apiUrl: "https://cfg.example.com" }
      );
      expect(snap.transport).toBe("access");
      expect(snap.apiHost).toBe("cfg.example.com");
    });

    it("combines Bearer + Access in auth summary", () => {
      const snap = getSettingsConnectionSnapshot({
        HOOX_API_TOKEN: "tok",
        CF_ACCESS_CLIENT_ID: "cid",
        CF_ACCESS_CLIENT_SECRET: "sec",
      });
      expect(snap.authSummary).toBe("Bearer + Access");
      expect(snap.transport).toBe("access");
    });
  });
});
