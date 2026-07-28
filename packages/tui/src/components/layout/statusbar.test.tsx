/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * StatusBar Tests — connection state, error display, and click-to-expand.
 *
 * Validates:
 *   - Connection state pills (CONNECTED/POLLING/RECONNECTING/OFFLINE)
 *   - Last-updated timestamp rendering
 *   - One-line error summary appears in OFFLINE/RECONNECTING states
 *   - Click-to-expand shows full diagnostic panel (command, exit code,
 *     stderr, stdout, duration, timestamp, error type)
 *   - Line counts render next to stderr/stdout section headers
 *   - Recovery hint renders for each CliErrorType
 *   - Copy affordance footer is present
 *   - Pill is interactive only when there are details to show
 *
 * Uses the real renderer with a sufficient viewport to capture the
 * expanded panel without truncation.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { useServiceStore } from "@jango-blockchained/hoox-shared/stores/service-store";
import type { CliErrorDetails } from "@jango-blockchained/hoox-shared";

import {
  StatusBar,
  ExpandedErrorPanel,
  resolveApiHostLabel,
} from "./statusbar";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Render the StatusBar and return the captured frame as a string. */
async function renderStatusBar(): Promise<string> {
  const { captureCharFrame, renderOnce } = await testRender(<StatusBar />, {
    width: 120,
    height: 30,
    exitOnCtrlC: false,
  });
  await renderOnce();
  return captureCharFrame();
}

/** Render the expanded error panel and return the captured frame. */
async function renderPanel(details: CliErrorDetails): Promise<string> {
  const { captureCharFrame, renderOnce } = await testRender(
    <ExpandedErrorPanel details={details} />,
    {
      width: 120,
      height: 30,
      exitOnCtrlC: false,
    }
  );
  await renderOnce();
  return captureCharFrame();
}

function resetStore() {
  useServiceStore.setState({
    connectionStatus: "connected",
    lastUpdated: 0,
    lastError: null,
    lastErrorDetails: null,
    retryCount: 0,
    reconnectDelay: 0,
    disconnectedAt: null,
    workers: [],
    tradeStream: [],
    alerts: [],
    logs: [],
    metrics: null,
    selectedWorkerId: null,
    lastSuccessfulFetch: 0,
  });
}

const sampleError: CliErrorDetails = {
  command: "/usr/local/bin/hoox check health",
  exitCode: 1,
  stderr: "Error: cloudflare credentials missing\nRun: hoox config env init",
  stdout: "",
  errorType: "non-zero-exit",
  timestamp: 1717000000000,
  duration: 1234,
};

// ─── StatusBar Tests ─────────────────────────────────────────────────────────

describe("StatusBar", () => {
  beforeEach(() => {
    resetStore();
  });

  // ── Connection state pills ──────────────────────────────────────────────

  describe("connection state pills", () => {
    it("shows CONNECTED when connection is healthy", async () => {
      useServiceStore.setState({ connectionStatus: "connected" });
      const output = await renderStatusBar();
      expect(output).toContain("CONNECTED");
    });

    it("shows POLLING when in polling state", async () => {
      useServiceStore.setState({ connectionStatus: "polling" });
      const output = await renderStatusBar();
      expect(output).toContain("POLLING");
    });

    it("shows RECONNECTING with retry count and backoff delay", async () => {
      useServiceStore.setState({
        connectionStatus: "reconnecting",
        retryCount: 3,
        reconnectDelay: 4000,
      });
      const output = await renderStatusBar();
      expect(output).toContain("RECONNECTING");
      expect(output).toContain("retry 3/5");
      expect(output).toContain("4000ms");
    });

    it("shows OFFLINE when disconnected", async () => {
      useServiceStore.setState({ connectionStatus: "offline" });
      const output = await renderStatusBar();
      expect(output).toContain("OFFLINE");
    });
  });

  // ── Last-updated timestamp ─────────────────────────────────────────────

  describe("timestamp display", () => {
    it("shows em-dash placeholder when lastUpdated is 0", async () => {
      useServiceStore.setState({
        connectionStatus: "connected",
        lastUpdated: 0,
      });
      const output = await renderStatusBar();
      expect(output).toContain("Updated:");
      expect(output).toContain("—");
    });

    it("prefixes with 'Last updated' in error state", async () => {
      useServiceStore.setState({
        connectionStatus: "offline",
        lastUpdated: Date.now() - 60_000,
      });
      const output = await renderStatusBar();
      expect(output).toContain("Last updated:");
    });

    it("prefixes with 'Updated' in healthy state", async () => {
      useServiceStore.setState({
        connectionStatus: "connected",
        lastUpdated: Date.now() - 60_000,
      });
      const output = await renderStatusBar();
      expect(output).toContain("Updated:");
      expect(output).not.toContain("Last updated:");
    });
  });

  // ── One-line error summary ─────────────────────────────────────────────

  describe("one-line error summary", () => {
    it("shows lastError in the one-line display when offline", async () => {
      useServiceStore.setState({
        connectionStatus: "offline",
        lastError: "Connection refused",
      });
      const output = await renderStatusBar();
      expect(output).toContain("Connection refused");
    });

    it("does not show lastError in the one-line display when connected", async () => {
      useServiceStore.setState({
        connectionStatus: "connected",
        lastError: "stale error from earlier",
      });
      const output = await renderStatusBar();
      // lastError should be cleared on success — assert it doesn't
      // appear in the visible one-line summary
      expect(output).not.toContain("stale error from earlier");
    });
  });

  // ── Pill interactivity ─────────────────────────────────────────────────

  describe("pill interactivity", () => {
    it("shows the expand hint when there are error details to show", async () => {
      useServiceStore.setState({
        connectionStatus: "offline",
        lastError: "fail",
        lastErrorDetails: sampleError,
      });
      const output = await renderStatusBar();
      // The expand hint is rendered when pillInteractive is true
      expect(output).toContain("click for details");
    });

    it("does not show the expand hint when no error details are present", async () => {
      useServiceStore.setState({
        connectionStatus: "offline",
        lastError: "fail",
        lastErrorDetails: null,
      });
      const output = await renderStatusBar();
      expect(output).not.toContain("click for details");
    });

    it("does not show the expand hint when connected (no error state)", async () => {
      useServiceStore.setState({
        connectionStatus: "connected",
        lastError: null,
        lastErrorDetails: null,
      });
      const output = await renderStatusBar();
      expect(output).not.toContain("click for details");
    });
  });

  // ── Keyboard hints ─────────────────────────────────────────────────────

  describe("keyboard hints", () => {
    it("shows ^P PALETTE · ^B SIDEBAR · ^Q QUIT hint", async () => {
      const output = await renderStatusBar();
      expect(output).toContain("PALETTE");
      expect(output).toContain("SIDEBAR");
      expect(output).toContain("QUIT");
    });
  });

  // ── LOCAL / REMOTE mode pill ───────────────────────────────────────────

  describe("mode indicator", () => {
    const originalMode = process.env.HOOX_TUI_MODE;
    const originalApi = process.env.HOOX_API_URL;

    afterEach(() => {
      if (originalMode === undefined) delete process.env.HOOX_TUI_MODE;
      else process.env.HOOX_TUI_MODE = originalMode;
      if (originalApi === undefined) delete process.env.HOOX_API_URL;
      else process.env.HOOX_API_URL = originalApi;
    });

    it("shows [LOCAL] when HOOX_TUI_MODE is unset", async () => {
      delete process.env.HOOX_TUI_MODE;
      const output = await renderStatusBar();
      expect(output).toContain("[LOCAL]");
      expect(output).not.toContain("[REMOTE]");
    });

    it("shows [LOCAL] when HOOX_TUI_MODE=local", async () => {
      process.env.HOOX_TUI_MODE = "local";
      const output = await renderStatusBar();
      expect(output).toContain("[LOCAL]");
    });

    it("shows [REMOTE] when HOOX_TUI_MODE=remote", async () => {
      process.env.HOOX_TUI_MODE = "remote";
      const output = await renderStatusBar();
      expect(output).toContain("[REMOTE]");
      expect(output).not.toContain("[LOCAL]");
    });

    it("shows the API host next to the mode pill", async () => {
      process.env.HOOX_TUI_MODE = "remote";
      process.env.HOOX_API_URL = "https://hoox.example.workers.dev";
      process.env.HOOX_API_TOKEN = "test-token";
      const output = await renderStatusBar();
      expect(output).toContain("hoox.example.workers.dev");
      expect(output).not.toContain("AUTH?");
    });

    it("shows AUTH? when remote without token", async () => {
      process.env.HOOX_TUI_MODE = "remote";
      process.env.HOOX_API_URL = "https://gw.test";
      delete process.env.HOOX_API_TOKEN;
      const output = await renderStatusBar();
      expect(output).toContain("AUTH?");
      expect(output).toContain("gw.test");
    });
  });
});

describe("resolveApiHostLabel", () => {
  it("extracts host from https URLs", () => {
    expect(resolveApiHostLabel("https://hoox.example.com/path")).toBe(
      "hoox.example.com"
    );
  });

  it("keeps port for localhost", () => {
    expect(resolveApiHostLabel("http://localhost:8787")).toBe("localhost:8787");
  });

  it("tolerates bare hosts", () => {
    expect(resolveApiHostLabel("not-a-url")).toBe("not-a-url");
  });
});

// ─── ExpandedErrorPanel Tests ────────────────────────────────────────────────

describe("ExpandedErrorPanel", () => {
  beforeEach(() => {
    resetStore();
  });

  it("renders the error type label and recovery hint", async () => {
    const output = await renderPanel(sampleError);
    expect(output).toContain("Command failed");
    expect(output).toContain("non-zero-exit");
    expect(output).toContain("Inspect stderr");
  });

  it("renders the command string for reproduction", async () => {
    const output = await renderPanel(sampleError);
    expect(output).toContain("/usr/local/bin/hoox check health");
  });

  it("renders the exit code", async () => {
    const output = await renderPanel(sampleError);
    expect(output).toContain("Exit code:");
    expect(output).toContain("1");
  });

  it("renders the duration in milliseconds", async () => {
    const output = await renderPanel(sampleError);
    expect(output).toContain("Duration:");
    expect(output).toContain("1234ms");
  });

  it("renders the timestamp as a clock time", async () => {
    const output = await renderPanel(sampleError);
    expect(output).toContain("Time:");
    // The timestamp 1717000000000 is around 2024-05-29 16:26:40 UTC.
    // Just check the format pattern HH:MM:SS exists.
    expect(output).toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });

  it("renders stderr with a line count", async () => {
    const output = await renderPanel(sampleError);
    expect(output).toContain("stderr");
    // 2 lines in the sample stderr
    expect(output).toContain("2 lines");
  });

  it("uses singular 'line' when stderr is a single line", async () => {
    const singleLineError: CliErrorDetails = {
      ...sampleError,
      stderr: "Single line error",
    };
    const output = await renderPanel(singleLineError);
    expect(output).toContain("1 line");
  });

  it("renders stdout section only when it differs from stderr", async () => {
    const withStdout: CliErrorDetails = {
      ...sampleError,
      stdout: "Warning: rate limit approaching",
    };
    const output = await renderPanel(withStdout);
    expect(output).toContain("stdout");
    expect(output).toContain("rate limit approaching");
  });

  it("hides the stdout section when it equals stderr", async () => {
    const sameAsStderr: CliErrorDetails = {
      ...sampleError,
      stdout: sampleError.stderr, // identical
    };
    const output = await renderPanel(sameAsStderr);
    // stdout section is omitted — only the stderr label appears once
    const stdoutMatches = output.match(/stdout/g);
    expect(stdoutMatches).toBeNull();
  });

  it("hides stderr section when stderr is empty", async () => {
    const noStderr: CliErrorDetails = {
      ...sampleError,
      stderr: "",
    };
    const output = await renderPanel(noStderr);
    expect(output).not.toContain("stderr (");
  });

  it("renders the copy affordance footer", async () => {
    const output = await renderPanel(sampleError);
    expect(output).toContain("Drag-select");
    expect(output).toContain("copy");
  });

  it("shows different recovery hints for different error types", async () => {
    const errorTypes = [
      "binary-not-found",
      "timeout",
      "aborted",
      "non-zero-exit",
      "spawn-error",
    ] as const;
    for (const errorType of errorTypes) {
      const details: CliErrorDetails = { ...sampleError, errorType };
      const output = await renderPanel(details);
      // Each error type has a unique recovery hint — verify it's present
      const hints: Record<typeof errorType, string> = {
        "binary-not-found": "HOOX_CLI",
        timeout: "timeout",
        aborted: "cancelled",
        "non-zero-exit": "Inspect stderr",
        "spawn-error": "permission or path",
      };
      expect(output).toContain(hints[errorType]);
    }
  });

  it("falls back to '(unknown)' when command is empty", async () => {
    const noCommand: CliErrorDetails = { ...sampleError, command: "" };
    const output = await renderPanel(noCommand);
    expect(output).toContain("unknown");
  });
});
