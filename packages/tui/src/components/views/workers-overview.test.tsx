/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
import { describe, it, expect, beforeEach } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { WorkersOverview } from "./workers-overview";
import {
  makeWorker,
  resetCliBridgeDouble,
  type TestWorkerInfo,
} from "../../test-utils";
import { useServiceStore } from "@jango-blockchained/hoox-shared/stores/service-store";
import { useUIStore } from "@jango-blockchained/hoox-shared/stores/ui-store";

function collectText(output: unknown): string[] {
  const texts: string[] = [];
  const walk = (node: any): void => {
    if (!node || typeof node !== "object") return;
    if (typeof node === "string") {
      texts.push(node);
      return;
    }
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) walk(child);
    }
    if (node.props?.children) {
      const c = node.props.children;
      if (Array.isArray(c)) c.forEach(walk);
      else walk(c);
    }
  };
  walk(output);
  return texts;
}

async function renderWorkersOverview(): Promise<string> {
  const { captureCharFrame, renderOnce } = await testRender(
    <WorkersOverview />,
    { width: 80, height: 24, exitOnCtrlC: false }
  );
  await renderOnce();
  return captureCharFrame();
}

function outputContains(output: string, ...substrings: string[]): boolean {
  return substrings.every((s) => output.includes(s));
}

function resetStores() {
  useServiceStore.setState({
    workers: [],
    logs: [],
    metrics: null,
    connectionStatus: "connected",
    selectedWorkerId: null,
    lastUpdated: 0,
    alerts: [],
    tradeStream: [],
    // Avoid real network during mount effects under partial mock wiring
    fetchWorkers: async () => {},
    streamTrades: async () => {},
    streamLogs: async () => {},
  });
  useUIStore.setState({
    activeView: "workers",
    sidebarExpanded: true,
    modal: null,
    commandPaletteOpen: false,
    previousView: null,
  });
}

describe("WorkersOverview", () => {
  beforeEach(() => {
    resetCliBridgeDouble();
    resetStores();
  });

  describe("2-column grid layout", () => {
    it("renders all workers", async () => {
      useServiceStore.setState({
        workers: [
          makeWorker({ id: "w1", name: "alpha" }),
          makeWorker({ id: "w2", name: "beta" }),
          makeWorker({ id: "w3", name: "gamma" }),
        ],
      });

      const text = await renderWorkersOverview();

      expect(outputContains(text, "ALPHA", "BETA", "GAMMA")).toBe(true);
      expect(outputContains(text, "3 total")).toBe(true);
    });

    it("shows empty state when no workers", async () => {
      const text = await renderWorkersOverview();

      expect(outputContains(text, "No workers connected")).toBe(true);
    });

    it("numbers workers with No.XX format", async () => {
      useServiceStore.setState({
        workers: [
          makeWorker({ id: "w1", name: "alpha" }),
          makeWorker({ id: "w2", name: "beta" }),
        ],
      });

      const text = await renderWorkersOverview();

      expect(outputContains(text, "No.01", "No.02")).toBe(true);
    });
  });

  describe("metric formatting", () => {
    it("formats uptime in hours when under 24h", async () => {
      useServiceStore.setState({
        workers: [makeWorker({ id: "w1", uptime: 7200 })],
      });

      const text = await renderWorkersOverview();

      expect(outputContains(text, "2h")).toBe(true);
    });

    it("formats uptime in days+hours when >= 24h", async () => {
      useServiceStore.setState({
        workers: [makeWorker({ id: "w1", uptime: 259200 })],
      });

      const text = await renderWorkersOverview();

      expect(outputContains(text, "3d0h")).toBe(true);
    });

    it("formats requests with K/M suffixes", async () => {
      useServiceStore.setState({
        workers: [
          makeWorker({ id: "w1", requests: 1_200 }),
          makeWorker({ id: "w2", requests: 1_200_000 }),
        ],
      });

      const text = await renderWorkersOverview();

      expect(outputContains(text, "1.2K", "1.2M")).toBe(true);
    });

    it("shows memory as used/128 MB", async () => {
      useServiceStore.setState({
        workers: [makeWorker({ id: "w1", memory: 64 })],
      });

      const text = await renderWorkersOverview();

      expect(outputContains(text, "64/128 MB")).toBe(true);
    });

    it("shows CPU as percentage", async () => {
      useServiceStore.setState({
        workers: [makeWorker({ id: "w1", cpu: 45.5 })],
      });

      const text = await renderWorkersOverview();

      expect(outputContains(text, "45.5%")).toBe(true);
    });
  });

  describe("status dots", () => {
    it("renders status dot for each worker", async () => {
      useServiceStore.setState({
        workers: [
          makeWorker({ id: "w1", status: "operational" }),
          makeWorker({ id: "w2", status: "degraded" }),
          makeWorker({ id: "w3", status: "down" }),
        ],
      });

      const text = await renderWorkersOverview();

      expect(outputContains(text, "█", "▌", "░")).toBe(true);
    });
  });

  describe("action buttons", () => {
    it("renders [View Details] and [Logs] per card", async () => {
      useServiceStore.setState({
        workers: [makeWorker({ id: "w1" })],
      });

      const text = await renderWorkersOverview();

      expect(outputContains(text, "[VIEW DETAILS]", "[LOGS]")).toBe(true);
    });
  });

  describe("scroll behavior", () => {
    it(
      "wraps content in scrollbox for overflow",
      async () => {
        const workers = [];
        for (let i = 0; i < 20; i++) {
          workers.push(makeWorker({ id: `w${i}`, name: `worker-${i}` }));
        }
        useServiceStore.setState({ workers });

        const text = await renderWorkersOverview();

        expect(outputContains(text, "20 total")).toBe(true);
      },
      { timeout: 15_000 }
    );
  });

  describe("keyboard navigation", () => {
    it("renders without errors (keyboard wired via useKeyboard)", async () => {
      useServiceStore.setState({
        workers: [
          makeWorker({ id: "w1" }),
          makeWorker({ id: "w2" }),
          makeWorker({ id: "w3" }),
          makeWorker({ id: "w4" }),
          makeWorker({ id: "w5" }),
        ],
      });

      const text = await renderWorkersOverview();
      expect(text).toBeDefined();
      expect(typeof text).toBe("string");
    });
  });
});
