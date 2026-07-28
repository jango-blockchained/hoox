/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test";

describe("Agent Components - Module Imports", () => {
  // Agent Components Tests
  describe("TestModel Component", () => {
    it("should be importable", async () => {
      const { TestModel } = await import("../src/components/agent/test-model");
      expect(TestModel).toBeDefined();
      expect(typeof TestModel).toBe("function");
    });

    it("should export TestModel as a React component", async () => {
      const module = await import("../src/components/agent/test-model");
      expect(module).toHaveProperty("TestModel");
      expect(module.TestModel.name).toBe("TestModel");
    });

    it("should be a client component", async () => {
      const { TestModel } = await import("../src/components/agent/test-model");
      expect(TestModel).toBeDefined();
    });
  });

  describe("RiskParameters Component", () => {
    it("should be importable", async () => {
      const { RiskParameters } =
        await import("../src/components/agent/risk-parameters");
      expect(RiskParameters).toBeDefined();
      expect(typeof RiskParameters).toBe("function");
    });

    it("should export RiskParameters as a React component", async () => {
      const module = await import("../src/components/agent/risk-parameters");
      expect(module).toHaveProperty("RiskParameters");
      expect(module.RiskParameters.name).toBe("RiskParameters");
    });

    it("should be a client component", async () => {
      const { RiskParameters } =
        await import("../src/components/agent/risk-parameters");
      expect(RiskParameters).toBeDefined();
    });
  });

  describe("ReasoningPanel Component", () => {
    it("should be importable", async () => {
      const { ReasoningPanel } =
        await import("../src/components/agent/reasoning-panel");
      expect(ReasoningPanel).toBeDefined();
      expect(typeof ReasoningPanel).toBe("function");
    });

    it("should export ReasoningPanel as a React component", async () => {
      const module = await import("../src/components/agent/reasoning-panel");
      expect(module).toHaveProperty("ReasoningPanel");
      expect(module.ReasoningPanel.name).toBe("ReasoningPanel");
    });

    it("should be a client component", async () => {
      const { ReasoningPanel } =
        await import("../src/components/agent/reasoning-panel");
      expect(ReasoningPanel).toBeDefined();
    });
  });

  describe("HealthCheck Component", () => {
    it("should be importable", async () => {
      const { HealthCheck } =
        await import("../src/components/agent/health-check");
      expect(HealthCheck).toBeDefined();
      expect(typeof HealthCheck).toBe("function");
    });

    it("should export HealthCheck as a React component", async () => {
      const module = await import("../src/components/agent/health-check");
      expect(module).toHaveProperty("HealthCheck");
      expect(module.HealthCheck.name).toBe("HealthCheck");
    });

    it("should be a client component", async () => {
      const { HealthCheck } =
        await import("../src/components/agent/health-check");
      expect(HealthCheck).toBeDefined();
    });
  });

  describe("ModelConfig Component", () => {
    it("should be importable", async () => {
      const { ModelConfig } =
        await import("../src/components/agent/model-config");
      expect(ModelConfig).toBeDefined();
      expect(typeof ModelConfig).toBe("function");
    });

    it("should export ModelConfig as a React component", async () => {
      const module = await import("../src/components/agent/model-config");
      expect(module).toHaveProperty("ModelConfig");
      expect(module.ModelConfig.name).toBe("ModelConfig");
    });

    it("should be a client component", async () => {
      const { ModelConfig } =
        await import("../src/components/agent/model-config");
      expect(ModelConfig).toBeDefined();
    });
  });

  describe("KillSwitch Component", () => {
    it("should be importable", async () => {
      const { KillSwitch } =
        await import("../src/components/agent/kill-switch");
      expect(KillSwitch).toBeDefined();
      expect(typeof KillSwitch).toBe("function");
    });

    it("should export KillSwitch as a React component", async () => {
      const module = await import("../src/components/agent/kill-switch");
      expect(module).toHaveProperty("KillSwitch");
      expect(module.KillSwitch.name).toBe("KillSwitch");
    });

    it("should be a client component", async () => {
      const { KillSwitch } =
        await import("../src/components/agent/kill-switch");
      expect(KillSwitch).toBeDefined();
    });
  });

  describe("ChatInterface Component", () => {
    it("should be importable", async () => {
      const { ChatInterface } =
        await import("../src/components/agent/chat-interface");
      expect(ChatInterface).toBeDefined();
      expect(typeof ChatInterface).toBe("function");
    });

    it("should export ChatInterface as a React component", async () => {
      const module = await import("../src/components/agent/chat-interface");
      expect(module).toHaveProperty("ChatInterface");
      expect(module.ChatInterface.name).toBe("ChatInterface");
    });

    it("should be a client component", async () => {
      const { ChatInterface } =
        await import("../src/components/agent/chat-interface");
      expect(ChatInterface).toBeDefined();
    });
  });

  describe("TrailingStops Component", () => {
    it("should be importable", async () => {
      const { TrailingStops } =
        await import("../src/components/agent/trailing-stops");
      expect(TrailingStops).toBeDefined();
      expect(typeof TrailingStops).toBe("function");
    });

    it("should export TrailingStops as a React component", async () => {
      const module = await import("../src/components/agent/trailing-stops");
      expect(module).toHaveProperty("TrailingStops");
      expect(module.TrailingStops.name).toBe("TrailingStops");
    });

    it("should be a client component", async () => {
      const { TrailingStops } =
        await import("../src/components/agent/trailing-stops");
      expect(TrailingStops).toBeDefined();
    });
  });

  describe("UsageTable Component", () => {
    it("should be importable", async () => {
      const { UsageTable } =
        await import("../src/components/agent/usage-table");
      expect(UsageTable).toBeDefined();
      expect(typeof UsageTable).toBe("function");
    });

    it("should export UsageTable as a React component", async () => {
      const module = await import("../src/components/agent/usage-table");
      expect(module).toHaveProperty("UsageTable");
      expect(module.UsageTable.name).toBe("UsageTable");
    });

    it("should be a client component", async () => {
      const { UsageTable } =
        await import("../src/components/agent/usage-table");
      expect(UsageTable).toBeDefined();
    });
  });

  describe("UsageChart Component", () => {
    it("should be importable", async () => {
      const { UsageChart } =
        await import("../src/components/agent/usage-chart");
      expect(UsageChart).toBeDefined();
      expect(typeof UsageChart).toBe("function");
    });

    it("should export UsageChart as a React component", async () => {
      const module = await import("../src/components/agent/usage-chart");
      expect(module).toHaveProperty("UsageChart");
      expect(module.UsageChart.name).toBe("UsageChart");
    });

    it("should be a client component", async () => {
      const { UsageChart } =
        await import("../src/components/agent/usage-chart");
      expect(UsageChart).toBeDefined();
    });
  });
});
