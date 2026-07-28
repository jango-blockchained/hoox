/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test";
import {
  messageAuthMissing,
  messageAuthRequired,
  messageConnected,
  messageConnectionLost,
  messageOfflineStartup,
  messageReconnected,
} from "./connection-toasts";

describe("connection-toasts messages", () => {
  it("connected includes mode and host", () => {
    expect(messageConnected("local", "localhost:8787")).toBe(
      "Connected · LOCAL · localhost:8787"
    );
    expect(messageConnected("remote", "hoox.example.workers.dev")).toBe(
      "Connected · REMOTE · hoox.example.workers.dev"
    );
  });

  it("lost includes mode and host", () => {
    expect(messageConnectionLost("remote", "gw.test")).toContain("REMOTE");
    expect(messageConnectionLost("local", "localhost:8787")).toContain("LOCAL");
  });

  it("reconnected includes downtime", () => {
    const msg = messageReconnected("remote", "gw.test", 1_000, 61_000);
    expect(msg).toContain("Reconnected");
    expect(msg).toContain("REMOTE");
    expect(msg).toContain("gw.test");
    expect(msg).toContain("downtime");
  });

  it("auth messages are explicit", () => {
    expect(messageAuthRequired("remote", "gw")).toContain("Auth failed");
    expect(messageAuthMissing("gw")).toContain("No API token");
  });

  it("offline startup distinguishes auth", () => {
    expect(messageOfflineStartup("remote", "gw", "auth")).toContain("(auth)");
    expect(
      messageOfflineStartup("local", "localhost:8787", "network")
    ).not.toContain("(auth)");
  });
});
