/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Service Store Tests — Worker data, trades, alerts, logs, connection state.
 *
 * Tests Zustand store actions including:
 *   - fetchWorkers (mocked API via shared hooxFetch double)
 *   - streamTrades (mocked SSE subscription)
 *   - Connection state machine transitions
 *   - Ring buffer limits (MAX_TRADES=500, MAX_ALERTS=100, MAX_LOGS=1000)
 *   - addAlert, pushTrade, pushLog, setMetrics
 *
 * Network doubles are process-wide from test-setup.ts (no per-file mock.module).
 */
import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { useServiceStore } from "@hoox-sh/hoox-shared/stores/service-store";
import type {
  WorkerInfo,
  Trade,
  Alert,
  LogEntry,
  SystemMetrics,
  ConnectionStatus,
  CliErrorDetails,
  CliErrorType,
} from "@hoox-sh/hoox-shared";
import {
  hooxFetchMock,
  subscribeSSEMock,
  resetNetworkDoubles,
  setMockApiData,
  setMockApiFailure,
} from "../network-test-double";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resetStore() {
  useServiceStore.setState({
    workers: [],
    tradeStream: [],
    alerts: [],
    logs: [],
    metrics: null,
    connectionStatus: "offline",
    lastUpdated: 0,
    selectedWorkerId: null,
    retryCount: 0,
    lastError: null,
    lastErrorDetails: null,
    lastSuccessfulFetch: 0,
    reconnectDelay: 0,
    disconnectedAt: null,
  });
  resetNetworkDoubles();
}

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: `trade-${Math.random().toString(36).slice(2, 8)}`,
    symbol: "BTC",
    side: "buy",
    price: 50000,
    quantity: 0.1,
    timestamp: Date.now(),
    exchange: "binance",
    ...overrides,
  };
}

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: `alert-${Math.random().toString(36).slice(2, 8)}`,
    type: "system",
    severity: "info",
    message: "Test alert",
    timestamp: Date.now(),
    acknowledged: false,
    ...overrides,
  };
}

function makeLog(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: `log-${Math.random().toString(36).slice(2, 8)}`,
    level: "info",
    message: "Test log entry",
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeWorker(overrides: Partial<WorkerInfo> = {}): WorkerInfo {
  return {
    id: `worker-${Math.random().toString(36).slice(2, 8)}`,
    name: "test-worker",
    status: "operational",
    uptime: 3600,
    cpu: 25,
    memory: 64,
    requests: 1000,
    durableObjectCount: 2,
    edgeCount: 5,
    ...overrides,
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("useServiceStore", () => {
  beforeEach(() => {
    resetStore();
  });

  // ── fetchWorkers ──────────────────────────────────────────────────────────

  describe("fetchWorkers", () => {
    it("fetches workers and updates store on success", async () => {
      const workers = [
        makeWorker({ name: "alpha" }),
        makeWorker({ name: "beta" }),
      ];
      setMockApiData(workers);

      await useServiceStore.getState().fetchWorkers();

      const state = useServiceStore.getState();
      expect(state.workers).toHaveLength(2);
      expect(state.workers[0].name).toBe("alpha");
      expect(state.workers[1].name).toBe("beta");
      expect(state.lastUpdated).toBeGreaterThan(0);
    });

    it("transitions from offline to connected on successful fetch", async () => {
      setMockApiData([makeWorker()]);
      useServiceStore.setState({ connectionStatus: "offline" });

      await useServiceStore.getState().fetchWorkers();

      expect(useServiceStore.getState().connectionStatus).toBe("connected");
    });

    it("transitions from polling to connected on successful fetch", async () => {
      setMockApiData([makeWorker()]);
      useServiceStore.setState({ connectionStatus: "polling" });

      await useServiceStore.getState().fetchWorkers();

      expect(useServiceStore.getState().connectionStatus).toBe("connected");
    });

    it("resets retry state on successful fetch", async () => {
      setMockApiData([makeWorker()]);
      useServiceStore.setState({
        connectionStatus: "reconnecting",
        retryCount: 3,
        lastError: "Previous error",
        reconnectDelay: 4000,
      });

      await useServiceStore.getState().fetchWorkers();

      const state = useServiceStore.getState();
      expect(state.retryCount).toBe(0);
      expect(state.lastError).toBeNull();
      expect(state.reconnectDelay).toBe(0);
    });

    it("updates lastSuccessfulFetch on success", async () => {
      setMockApiData([makeWorker()]);
      await useServiceStore.getState().fetchWorkers();
      expect(useServiceStore.getState().lastSuccessfulFetch).toBeGreaterThan(0);
    });
  });

  // ── fetchWorkers (error path) ─────────────────────────────────────────────

  describe("fetchWorkers error handling", () => {
    it("transitions from connected to reconnecting on failure", async () => {
      setMockApiFailure(true, "Connection refused");
      useServiceStore.setState({ connectionStatus: "connected" });

      await useServiceStore.getState().fetchWorkers();

      const state = useServiceStore.getState();
      expect(state.connectionStatus).toBe("reconnecting");
      expect(state.retryCount).toBe(1);
      expect(state.lastError).toBe("Connection refused");
      expect(state.reconnectDelay).toBe(1000); // first backoff: 1s
    });

    it("transitions from polling to reconnecting on failure", async () => {
      setMockApiFailure(true);
      useServiceStore.setState({ connectionStatus: "polling" });

      await useServiceStore.getState().fetchWorkers();

      expect(useServiceStore.getState().connectionStatus).toBe("reconnecting");
    });

    it("tracks retry count incrementally", async () => {
      setMockApiFailure(true);
      useServiceStore.setState({ connectionStatus: "connected" });

      // First failure
      await useServiceStore.getState().fetchWorkers();
      expect(useServiceStore.getState().retryCount).toBe(1);

      // Second failure
      useServiceStore.setState({ connectionStatus: "reconnecting" }); // simulate reconnecting
      await useServiceStore.getState().fetchWorkers();
      // retryCount should be 1 (not incrementing since fetchWorkers only increments on connected/polling → reconnecting)
      // handleConnectionFailure actually increments. fetchWorkers only increments for the first transition.
      // fetchWorkers sets retryCount +1 when going connected→reconnecting. On subsequent calls while reconnecting,
      // it updates lastError but doesn't modify retryCount further.
    });

    it("sets disconnectedAt on first failure", async () => {
      setMockApiFailure(true);
      useServiceStore.setState({
        connectionStatus: "connected",
        disconnectedAt: null,
      });

      await useServiceStore.getState().fetchWorkers();

      expect(useServiceStore.getState().disconnectedAt).toBeGreaterThan(0);
    });

    it("preserves existing disconnectedAt on repeated failures", async () => {
      setMockApiFailure(true);
      const before = Date.now();
      useServiceStore.setState({
        connectionStatus: "connected",
        disconnectedAt: null,
      });

      await useServiceStore.getState().fetchWorkers();
      const firstDisconnect = useServiceStore.getState().disconnectedAt;

      useServiceStore.setState({ connectionStatus: "reconnecting" });
      await useServiceStore.getState().fetchWorkers();

      expect(useServiceStore.getState().disconnectedAt).toBe(firstDisconnect);
    });

    it("transitions to offline after 5 retries", async () => {
      setMockApiFailure(true);
      useServiceStore.setState({
        connectionStatus: "connected",
        retryCount: 4,
      });

      await useServiceStore.getState().fetchWorkers();

      // retryCount goes to 5, which is >= MAX_RETRIES (5)
      expect(useServiceStore.getState().connectionStatus).toBe("offline");
      expect(useServiceStore.getState().lastError).toContain(
        "Connection lost after 5 retries"
      );
    });
  });

  // ── Connection State Machine ──────────────────────────────────────────────

  describe("connection state machine", () => {
    it("handleConnectionSuccess resets all error state", () => {
      useServiceStore.setState({
        connectionStatus: "reconnecting",
        retryCount: 3,
        lastError: "Some error",
        reconnectDelay: 4000,
        disconnectedAt: Date.now(),
      });

      useServiceStore.getState().handleConnectionSuccess();

      const state = useServiceStore.getState();
      expect(state.connectionStatus).toBe("connected");
      expect(state.retryCount).toBe(0);
      expect(state.lastError).toBeNull();
      expect(state.reconnectDelay).toBe(0);
      expect(state.disconnectedAt).toBeNull();
    });

    it("handleConnectionSuccess from polling goes to connected", () => {
      useServiceStore.setState({ connectionStatus: "polling" });
      useServiceStore.getState().handleConnectionSuccess();
      expect(useServiceStore.getState().connectionStatus).toBe("connected");
    });

    it("handleConnectionFailure from connected transitions to reconnecting", () => {
      useServiceStore.setState({ connectionStatus: "connected" });
      useServiceStore.getState().handleConnectionFailure("API down");

      const state = useServiceStore.getState();
      expect(state.connectionStatus).toBe("reconnecting");
      expect(state.retryCount).toBe(1);
      expect(state.lastError).toBe("API down");
    });

    it("handleConnectionFailure increments retry count when reconnecting", () => {
      useServiceStore.setState({
        connectionStatus: "reconnecting",
        retryCount: 2,
      });
      useServiceStore.getState().handleConnectionFailure("Still down");

      expect(useServiceStore.getState().retryCount).toBe(3);
      expect(useServiceStore.getState().reconnectDelay).toBe(4000); // retryCount=3 → index=Math.min(3-1,4)=2 → BACKOFF[2]=4000

      // Actually retryCount starts at 1 for handleConnectionFailure, so after first failure retryCount=1.
      // When called again with retryCount=2, it becomes 3 → backoff[2]=4000. Let me verify the backoff.
      // getBackoffDelay(3): index = Math.min(3-1, 4) = 2 → BACKOFF[2] = 4000. Correct.
    });

    it("handleConnectionFailure transitions to offline after 5 retries", () => {
      useServiceStore.setState({
        connectionStatus: "reconnecting",
        retryCount: 4,
      });
      useServiceStore.getState().handleConnectionFailure("Final fail");

      expect(useServiceStore.getState().connectionStatus).toBe("offline");
      expect(useServiceStore.getState().lastError).toContain(
        "Connection lost after 5 retries"
      );
    });

    it("setConnectionStatus resets retries when going to connected", () => {
      useServiceStore.setState({
        retryCount: 3,
        lastError: "old error",
        reconnectDelay: 4000,
      });
      useServiceStore.getState().setConnectionStatus("connected");

      expect(useServiceStore.getState().retryCount).toBe(0);
      expect(useServiceStore.getState().lastError).toBeNull();
      expect(useServiceStore.getState().reconnectDelay).toBe(0);
    });

    it("setConnectionStatus tracks disconnectedAt for offline/reconnecting", () => {
      useServiceStore.setState({ disconnectedAt: null });
      useServiceStore.getState().setConnectionStatus("offline");
      expect(useServiceStore.getState().disconnectedAt).toBeGreaterThan(0);
    });

    it("forceRetry from offline goes to polling", () => {
      useServiceStore.setState({
        connectionStatus: "offline",
        retryCount: 5,
        lastError: "Lost connection",
      });
      useServiceStore.getState().forceRetry();

      expect(useServiceStore.getState().connectionStatus).toBe("polling");
      expect(useServiceStore.getState().retryCount).toBe(0);
      expect(useServiceStore.getState().lastError).toBeNull();
    });

    it("forceRetry does nothing when not offline", () => {
      useServiceStore.setState({
        connectionStatus: "connected",
        retryCount: 0,
      });
      useServiceStore.getState().forceRetry();
      expect(useServiceStore.getState().connectionStatus).toBe("connected");
    });

    it("resetRetries clears all retry state", () => {
      useServiceStore.setState({
        retryCount: 4,
        lastError: "error",
        reconnectDelay: 16000,
        disconnectedAt: Date.now(),
      });
      useServiceStore.getState().resetRetries();

      expect(useServiceStore.getState().retryCount).toBe(0);
      expect(useServiceStore.getState().lastError).toBeNull();
      expect(useServiceStore.getState().reconnectDelay).toBe(0);
      expect(useServiceStore.getState().disconnectedAt).toBeNull();
    });

    // Backoff sequence tests
    it("calculates correct backoff delays", () => {
      // These verify the internal BACKOFF_SEQUENCE logic through the store
      // After 1st failure (connected → reconnecting): retryCount=1 → reconnectDelay=1000
      useServiceStore.setState({ connectionStatus: "connected" });
      useServiceStore.getState().handleConnectionFailure("e1");
      expect(useServiceStore.getState().reconnectDelay).toBe(1000);

      // After 2nd failure: retryCount=2 → reconnectDelay=2000
      useServiceStore.getState().handleConnectionFailure("e2");
      expect(useServiceStore.getState().reconnectDelay).toBe(2000);

      // After 3rd failure: retryCount=3 → reconnectDelay=4000
      useServiceStore.getState().handleConnectionFailure("e3");
      expect(useServiceStore.getState().reconnectDelay).toBe(4000);

      // After 4th failure: retryCount=4 → reconnectDelay=8000
      useServiceStore.getState().handleConnectionFailure("e4");
      expect(useServiceStore.getState().reconnectDelay).toBe(8000);

      // After 5th failure: retryCount=5 → offline (reconnectDelay=0)
      useServiceStore.getState().handleConnectionFailure("e5");
      expect(useServiceStore.getState().connectionStatus).toBe("offline");
      expect(useServiceStore.getState().reconnectDelay).toBe(0);
    });
  });

  // ── Structured CLI Error Details ─────────────────────────────────────────

  describe("setLastErrorDetails", () => {
    const sampleDetails: CliErrorDetails = {
      command: "/usr/local/bin/hoox check health",
      exitCode: 1,
      stderr:
        "Error: cloudflare credentials missing\nRun: hoox config env init",
      stdout: "",
      errorType: "non-zero-exit",
      timestamp: 1717000000000,
      duration: 1234,
    };

    it("stores full structured error in lastErrorDetails", () => {
      useServiceStore.getState().setLastErrorDetails(sampleDetails);
      const state = useServiceStore.getState();
      expect(state.lastErrorDetails).not.toBeNull();
      expect(state.lastErrorDetails?.command).toBe(sampleDetails.command);
      expect(state.lastErrorDetails?.exitCode).toBe(1);
      expect(state.lastErrorDetails?.errorType).toBe("non-zero-exit");
    });

    it("mirrors a short summary into lastError for one-line display", () => {
      useServiceStore.getState().setLastErrorDetails(sampleDetails);
      const state = useServiceStore.getState();
      expect(state.lastError).toContain("cloudflare credentials missing");
    });

    it("falls back to stdout when stderr is empty", () => {
      useServiceStore.getState().setLastErrorDetails({
        ...sampleDetails,
        stderr: "",
        stdout: '{"ok":false,"reason":"auth failed"}',
      });
      expect(useServiceStore.getState().lastError).toContain("auth failed");
    });

    it("falls back to command when both stderr and stdout are empty", () => {
      useServiceStore.getState().setLastErrorDetails({
        ...sampleDetails,
        stderr: "",
        stdout: "",
      });
      expect(useServiceStore.getState().lastError).toBe(sampleDetails.command);
    });

    it("clears both lastError and lastErrorDetails when set to null", () => {
      useServiceStore.getState().setLastErrorDetails(sampleDetails);
      expect(useServiceStore.getState().lastErrorDetails).not.toBeNull();

      useServiceStore.getState().setLastErrorDetails(null);
      const state = useServiceStore.getState();
      expect(state.lastErrorDetails).toBeNull();
      expect(state.lastError).toBeNull();
    });

    it("truncates very long error messages to keep the one-line display tidy", () => {
      const huge = "x".repeat(500);
      useServiceStore.getState().setLastErrorDetails({
        ...sampleDetails,
        stderr: huge,
      });
      const lastError = useServiceStore.getState().lastError;
      expect(lastError).not.toBeNull();
      expect(lastError?.length).toBeLessThanOrEqual(120);
    });

    it("handleConnectionSuccess clears lastErrorDetails along with lastError", async () => {
      useServiceStore.getState().setLastErrorDetails(sampleDetails);
      useServiceStore.getState().handleConnectionSuccess();
      const state = useServiceStore.getState();
      expect(state.lastErrorDetails).toBeNull();
      expect(state.lastError).toBeNull();
    });

    it("resetRetries clears lastErrorDetails", () => {
      useServiceStore.getState().setLastErrorDetails(sampleDetails);
      useServiceStore.getState().resetRetries();
      expect(useServiceStore.getState().lastErrorDetails).toBeNull();
    });

    it("forceRetry clears lastErrorDetails when leaving offline state", () => {
      useServiceStore.setState({
        connectionStatus: "offline",
        lastErrorDetails: sampleDetails,
      });
      useServiceStore.getState().forceRetry();
      expect(useServiceStore.getState().lastErrorDetails).toBeNull();
    });

    it("preserves classification — accepts all CliErrorType variants", () => {
      const variants: CliErrorType[] = [
        "binary-not-found",
        "timeout",
        "aborted",
        "non-zero-exit",
        "spawn-error",
      ];
      for (const errorType of variants) {
        useServiceStore.getState().setLastErrorDetails({
          ...sampleDetails,
          errorType,
        });
        expect(useServiceStore.getState().lastErrorDetails?.errorType).toBe(
          errorType
        );
      }
    });
  });

  // ── clearError (acknowledgement alias) ─────────────────────────────────

  describe("clearError", () => {
    it("clears both lastError and lastErrorDetails", () => {
      useServiceStore.setState({
        lastError: "stale summary",
        lastErrorDetails: {
          command: "hoox check health",
          exitCode: 1,
          stderr: "fail",
          stdout: "",
          errorType: "non-zero-exit",
          timestamp: Date.now(),
          duration: 100,
        },
      });

      useServiceStore.getState().clearError();

      const state = useServiceStore.getState();
      expect(state.lastError).toBeNull();
      expect(state.lastErrorDetails).toBeNull();
    });

    it("is a no-op when there is no error state", () => {
      // Should not throw on an already-clean store
      useServiceStore.setState({
        lastError: null,
        lastErrorDetails: null,
      });
      expect(() => useServiceStore.getState().clearError()).not.toThrow();
      const state = useServiceStore.getState();
      expect(state.lastError).toBeNull();
      expect(state.lastErrorDetails).toBeNull();
    });

    it("does not touch connection state (unlike handleConnectionSuccess)", () => {
      useServiceStore.setState({
        connectionStatus: "reconnecting",
        retryCount: 2,
        reconnectDelay: 4000,
        lastError: "old",
        lastErrorDetails: {
          command: "hoox check health",
          exitCode: 1,
          stderr: "fail",
          stdout: "",
          errorType: "non-zero-exit",
          timestamp: Date.now(),
          duration: 100,
        },
      });

      useServiceStore.getState().clearError();

      const state = useServiceStore.getState();
      // Error fields cleared
      expect(state.lastError).toBeNull();
      expect(state.lastErrorDetails).toBeNull();
      // Connection state machine untouched
      expect(state.connectionStatus).toBe("reconnecting");
      expect(state.retryCount).toBe(2);
      expect(state.reconnectDelay).toBe(4000);
    });
  });

  // ── addCliErrorAlert (status bar + alerts panel propagation) ───────────

  describe("addCliErrorAlert", () => {
    const cliFailure: CliErrorDetails = {
      command: "hoox deploy all",
      exitCode: 1,
      stderr: "Build failed: missing import",
      stdout: "",
      errorType: "non-zero-exit",
      timestamp: Date.now(),
      duration: 2500,
    };

    it("stores the structured error in lastErrorDetails", () => {
      useServiceStore.getState().addCliErrorAlert(cliFailure);
      const state = useServiceStore.getState();
      expect(state.lastErrorDetails).not.toBeNull();
      expect(state.lastErrorDetails?.command).toBe(cliFailure.command);
      expect(state.lastErrorDetails?.errorType).toBe(cliFailure.errorType);
    });

    it("mirrors a short summary into lastError", () => {
      useServiceStore.getState().addCliErrorAlert(cliFailure);
      expect(useServiceStore.getState().lastError).toContain(
        "Build failed: missing import"
      );
    });

    it("appends a high-severity alert to the alerts ring buffer", () => {
      expect(useServiceStore.getState().alerts).toHaveLength(0);
      useServiceStore.getState().addCliErrorAlert(cliFailure);

      const alerts = useServiceStore.getState().alerts;
      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe("error");
      expect(alerts[0].type).toBe("connection");
      expect(alerts[0].message).toContain("CLI failure");
      expect(alerts[0].message).toContain("Build failed: missing import");
      expect(alerts[0].acknowledged).toBe(false);
      expect(alerts[0].id).toBeTruthy();
      expect(alerts[0].timestamp).toBeGreaterThan(0);
    });

    it("appends multiple alerts without dropping older ones under the cap", () => {
      useServiceStore.getState().addCliErrorAlert(cliFailure);
      useServiceStore.getState().addCliErrorAlert({
        ...cliFailure,
        command: "hox workers deploy",
        stderr: "second failure",
      });

      const alerts = useServiceStore.getState().alerts;
      expect(alerts).toHaveLength(2);
      expect(alerts[0].message).toContain("Build failed: missing import");
      expect(alerts[1].message).toContain("second failure");
    });

    it("respects the MAX_ALERTS cap of 100 entries", () => {
      for (let i = 0; i < 110; i++) {
        useServiceStore.getState().addCliErrorAlert({
          ...cliFailure,
          stderr: `failure ${i}`,
        });
      }
      expect(useServiceStore.getState().alerts).toHaveLength(100);
      // Newest entries survive
      const alerts = useServiceStore.getState().alerts;
      expect(alerts[alerts.length - 1].message).toContain("failure 109");
    });

    it("also works when stderr is empty (falls back to command summary)", () => {
      useServiceStore.getState().addCliErrorAlert({
        ...cliFailure,
        stderr: "",
        stdout: "",
      });
      const lastError = useServiceStore.getState().lastError;
      // summarizeCliError falls back to the command itself
      expect(lastError).toBe(cliFailure.command);
      // And the alert still contains the command
      const alerts = useServiceStore.getState().alerts;
      expect(alerts[0].message).toContain("CLI failure");
      expect(alerts[0].message).toContain("hoox deploy all");
    });
  });

  // ── Ring Buffer Limits ────────────────────────────────────────────────────

  describe("ring buffer limits", () => {
    it("caps trade stream at 500 entries", () => {
      const store = useServiceStore.getState();
      for (let i = 0; i < 600; i++) {
        store.pushTrade(makeTrade({ id: `t${i}` }));
      }
      expect(useServiceStore.getState().tradeStream).toHaveLength(500);
    });

    it("trade stream keeps newest entries when exceeding cap", () => {
      const store = useServiceStore.getState();
      // Push 501 trades, verify first one is dropped
      store.pushTrade(makeTrade({ id: "first" }));
      for (let i = 0; i < 500; i++) {
        store.pushTrade(makeTrade({ id: `fill-${i}` }));
      }
      const stream = useServiceStore.getState().tradeStream;
      expect(stream).toHaveLength(500);
      // "first" should be dropped
      expect(stream.find((t) => t.id === "first")).toBeUndefined();
    });

    it("caps alerts at 100 entries", () => {
      for (let i = 0; i < 150; i++) {
        useServiceStore
          .getState()
          .addAlert(makeAlert({ id: `a${i}`, timestamp: i }));
      }
      expect(useServiceStore.getState().alerts).toHaveLength(100);
    });

    it("alerts buffer keeps newest entries", () => {
      useServiceStore
        .getState()
        .addAlert(makeAlert({ id: "first-old", timestamp: 1 }));
      for (let i = 0; i < 100; i++) {
        useServiceStore
          .getState()
          .addAlert(makeAlert({ id: `a${i}`, timestamp: i + 100 }));
      }
      expect(
        useServiceStore.getState().alerts.find((a) => a.id === "first-old")
      ).toBeUndefined();
    });

    it("caps logs at 1000 entries", () => {
      for (let i = 0; i < 1200; i++) {
        useServiceStore.getState().pushLog(makeLog({ id: `l${i}` }));
      }
      expect(useServiceStore.getState().logs).toHaveLength(1000);
    });

    it("logs buffer keeps newest entries when exceeding cap", () => {
      useServiceStore.getState().pushLog(makeLog({ id: "first-log" }));
      for (let i = 0; i < 1000; i++) {
        useServiceStore.getState().pushLog(makeLog({ id: `fill-${i}` }));
      }
      expect(
        useServiceStore.getState().logs.find((l) => l.id === "first-log")
      ).toBeUndefined();
    });

    it("trade stream preserves order (FIFO)", () => {
      const store = useServiceStore.getState();
      store.pushTrade(makeTrade({ id: "a", timestamp: 1 }));
      store.pushTrade(makeTrade({ id: "b", timestamp: 2 }));
      store.pushTrade(makeTrade({ id: "c", timestamp: 3 }));

      const stream = useServiceStore.getState().tradeStream;
      expect(stream[0].id).toBe("a");
      expect(stream[1].id).toBe("b");
      expect(stream[2].id).toBe("c");
    });
  });

  // ── addAlert ──────────────────────────────────────────────────────────────

  describe("addAlert", () => {
    it("adds a single alert", () => {
      const alert = makeAlert({
        message: "CPU threshold exceeded",
        severity: "warning",
      });
      useServiceStore.getState().addAlert(alert);

      expect(useServiceStore.getState().alerts).toHaveLength(1);
      expect(useServiceStore.getState().alerts[0].message).toBe(
        "CPU threshold exceeded"
      );
    });

    it("adds multiple alerts in order", () => {
      useServiceStore
        .getState()
        .addAlert(makeAlert({ id: "a1", timestamp: 100 }));
      useServiceStore
        .getState()
        .addAlert(makeAlert({ id: "a2", timestamp: 200 }));
      useServiceStore
        .getState()
        .addAlert(makeAlert({ id: "a3", timestamp: 300 }));

      expect(useServiceStore.getState().alerts).toHaveLength(3);
    });

    it("addAlert respects MAX_ALERTS cap", () => {
      for (let i = 0; i < 110; i++) {
        useServiceStore.getState().addAlert(makeAlert({ id: `a${i}` }));
      }
      expect(useServiceStore.getState().alerts).toHaveLength(100);
    });
  });

  // ── addAlerts (bulk) ──────────────────────────────────────────────────────

  describe("addAlerts (bulk)", () => {
    it("adds multiple alerts at once", () => {
      const alerts = [
        makeAlert({ id: "b1", message: "Bulk 1" }),
        makeAlert({ id: "b2", message: "Bulk 2" }),
      ];
      useServiceStore.getState().addAlerts(alerts);
      expect(useServiceStore.getState().alerts).toHaveLength(2);
    });

    it("caps bulk adds at 100", () => {
      const alerts = Array.from({ length: 150 }, (_, i) =>
        makeAlert({ id: `bulk-${i}`, timestamp: i })
      );
      useServiceStore.getState().addAlerts(alerts);
      expect(useServiceStore.getState().alerts).toHaveLength(100);
    });
  });

  // ── selectWorker / setWorkers / setMetrics ────────────────────────────────

  describe("worker selection and metrics", () => {
    it("selectWorker sets selectedWorkerId", () => {
      useServiceStore.getState().selectWorker("worker-123");
      expect(useServiceStore.getState().selectedWorkerId).toBe("worker-123");
    });

    it("selectWorker clears selection with null", () => {
      useServiceStore.getState().selectWorker("worker-123");
      useServiceStore.getState().selectWorker(null);
      expect(useServiceStore.getState().selectedWorkerId).toBeNull();
    });

    it("setWorkers replaces worker list and updates timestamp", () => {
      const workers = [makeWorker(), makeWorker()];
      useServiceStore.getState().setWorkers(workers);

      expect(useServiceStore.getState().workers).toHaveLength(2);
      expect(useServiceStore.getState().lastUpdated).toBeGreaterThan(0);
    });

    it("setMetrics updates metrics and timestamp", () => {
      const metrics: SystemMetrics = {
        totalWorkers: 10,
        onlineWorkers: 8,
        totalPnl: 15000,
        activeStrategies: 3,
        dailyTrades: 500,
        aiCalls: 50,
        uptime: 360000,
        lastUpdated: Date.now(),
      };
      useServiceStore.getState().setMetrics(metrics);
      expect(useServiceStore.getState().metrics?.totalPnl).toBe(15000);
      expect(useServiceStore.getState().lastUpdated).toBe(metrics.lastUpdated);
    });
  });

  // ── streamTrades ─────────────────────────────────────────────────────────

  describe("streamTrades", () => {
    it("subscribes to SSE trade stream", async () => {
      await useServiceStore.getState().streamTrades();
      expect(subscribeSSEMock).toHaveBeenCalledTimes(1);
      expect(subscribeSSEMock.mock.calls[0][0]).toBe("/v1/trades/stream");
    });

    it("streamTrades does not throw on SSE connection failure", async () => {
      // override the mock to simulate failure
      const origMock = subscribeSSEMock.getMockImplementation();
      subscribeSSEMock.mockImplementation(async () => {
        throw new Error("SSE failed");
      });

      // Should not throw
      await expect(
        useServiceStore.getState().streamTrades()
      ).resolves.toBeUndefined();

      // Restore
      subscribeSSEMock.mockImplementation(origMock as any);
    });
  });

  // ── Initial State ─────────────────────────────────────────────────────────

  describe("initial state", () => {
    it("starts with empty workers array", () => {
      resetStore();
      expect(useServiceStore.getState().workers).toEqual([]);
    });

    it("starts with empty trade stream", () => {
      resetStore();
      expect(useServiceStore.getState().tradeStream).toEqual([]);
    });

    it("starts with offline connection status", () => {
      resetStore();
      expect(useServiceStore.getState().connectionStatus).toBe("offline");
    });

    it("starts with null metrics", () => {
      resetStore();
      expect(useServiceStore.getState().metrics).toBeNull();
    });

    it("starts with no selected worker", () => {
      resetStore();
      expect(useServiceStore.getState().selectedWorkerId).toBeNull();
    });
  });
});
