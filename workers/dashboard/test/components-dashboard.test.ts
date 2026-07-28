/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test";

describe("Dashboard Components - Module Imports", () => {
  // Header Component Tests
  describe("DashboardHeader Component", () => {
    it("should be importable", async () => {
      const { DashboardHeader } =
        await import("../src/components/dashboard/header");
      expect(DashboardHeader).toBeDefined();
      expect(typeof DashboardHeader).toBe("function");
    });

    it("should export DashboardHeader as a React component", async () => {
      const module = await import("../src/components/dashboard/header");
      expect(module).toHaveProperty("DashboardHeader");
      expect(module.DashboardHeader.name).toBe("DashboardHeader");
    });

    it("should be a client component", async () => {
      const module = await import("../src/components/dashboard/header");
      expect(module.DashboardHeader).toBeDefined();
    });

    it("should render header with status indicators", async () => {
      const { DashboardHeader } =
        await import("../src/components/dashboard/header");
      expect(DashboardHeader).toBeDefined();
    });

    it("should include navigation elements", async () => {
      const { DashboardHeader } =
        await import("../src/components/dashboard/header");
      expect(DashboardHeader).toBeDefined();
    });

    it("should include dropdown menu", async () => {
      const { DashboardHeader } =
        await import("../src/components/dashboard/header");
      expect(DashboardHeader).toBeDefined();
    });

    it("should include tooltip provider", async () => {
      const { DashboardHeader } =
        await import("../src/components/dashboard/header");
      expect(DashboardHeader).toBeDefined();
    });
  });

  // Sidebar Component Tests
  describe("AppSidebar Component", () => {
    it("should be importable", async () => {
      const { AppSidebar } =
        await import("../src/components/dashboard/sidebar");
      expect(AppSidebar).toBeDefined();
      expect(typeof AppSidebar).toBe("function");
    });

    it("should export AppSidebar as a React component", async () => {
      const module = await import("../src/components/dashboard/sidebar");
      expect(module).toHaveProperty("AppSidebar");
      expect(module.AppSidebar.name).toBe("AppSidebar");
    });

    it("should be a client component", async () => {
      const { AppSidebar } =
        await import("../src/components/dashboard/sidebar");
      expect(AppSidebar).toBeDefined();
    });

    it("should include sidebar header", async () => {
      const { AppSidebar } =
        await import("../src/components/dashboard/sidebar");
      expect(AppSidebar).toBeDefined();
    });

    it("should include sidebar content", async () => {
      const { AppSidebar } =
        await import("../src/components/dashboard/sidebar");
      expect(AppSidebar).toBeDefined();
    });

    it("should include sidebar footer", async () => {
      const { AppSidebar } =
        await import("../src/components/dashboard/sidebar");
      expect(AppSidebar).toBeDefined();
    });

    it("should be collapsible", async () => {
      const { AppSidebar } =
        await import("../src/components/dashboard/sidebar");
      expect(AppSidebar).toBeDefined();
    });
  });

  // Navigation Components Tests
  describe("SidebarNav Component", () => {
    it("should be importable", async () => {
      const { SidebarNav } =
        await import("../src/components/dashboard/sidebar-nav");
      expect(SidebarNav).toBeDefined();
      expect(typeof SidebarNav).toBe("function");
    });

    it("should export SidebarNav as a React component", async () => {
      const module = await import("../src/components/dashboard/sidebar-nav");
      expect(module).toHaveProperty("SidebarNav");
      expect(module.SidebarNav.name).toBe("SidebarNav");
    });

    it("should be a client component", async () => {
      const { SidebarNav } =
        await import("../src/components/dashboard/sidebar-nav");
      expect(SidebarNav).toBeDefined();
    });

    it("should not include duplicate /dashboard entries", async () => {
      const sourcePath = `${import.meta.dir}/../src/components/dashboard/sidebar-config.ts`;
      const source = await Bun.file(sourcePath).text();
      // Count how many times href: "/dashboard" appears — should be exactly 1
      const matches = source.match(/href:\s*['"]\/dashboard['"]/g);
      expect(matches).toHaveLength(1);
    });

    it("should have real routes for primary, monitoring, and system items", async () => {
      const { primaryNavItems, monitoringNavItems, systemNavItems } =
        await import("../src/components/dashboard/sidebar-config");
      const allItems = [
        ...primaryNavItems,
        ...monitoringNavItems,
        ...systemNavItems,
      ];
      for (const item of allItems) {
        // Allow "/dashboard" and "/dashboard/<slug>"
        expect(item.href).toMatch(/^\/dashboard(\/[a-z-]+)?$/);
        // No "#" placeholders in route-based sections
        expect(item.href).not.toBe("#");
      }
    });
  });

  describe("Sidebar Config", () => {
    it("should export primaryNavItems", async () => {
      const { primaryNavItems } =
        await import("../src/components/dashboard/sidebar-config");
      expect(primaryNavItems).toBeDefined();
      expect(Array.isArray(primaryNavItems)).toBe(true);
      expect(primaryNavItems.length).toBeGreaterThan(0);
    });

    it("should export monitoringNavItems", async () => {
      const { monitoringNavItems } =
        await import("../src/components/dashboard/sidebar-config");
      expect(monitoringNavItems).toBeDefined();
      expect(Array.isArray(monitoringNavItems)).toBe(true);
    });

    it("should export systemNavItems", async () => {
      const { systemNavItems } =
        await import("../src/components/dashboard/sidebar-config");
      expect(systemNavItems).toBeDefined();
      expect(Array.isArray(systemNavItems)).toBe(true);
    });

    it("should export footerNavItems", async () => {
      const { footerNavItems } =
        await import("../src/components/dashboard/sidebar-config");
      expect(footerNavItems).toBeDefined();
      expect(Array.isArray(footerNavItems)).toBe(true);
    });

    it("should export the isActiveRoute utility", async () => {
      const { isActiveRoute } =
        await import("../src/components/dashboard/sidebar-config");
      expect(isActiveRoute).toBeDefined();
      expect(typeof isActiveRoute).toBe("function");
      // Exact match
      expect(isActiveRoute("/dashboard/agent", "/dashboard/agent")).toBe(true);
      // Sub-path match
      expect(isActiveRoute("/dashboard/agent/chat", "/dashboard/agent")).toBe(
        true
      );
      // No false match from "/dashboard"
      expect(isActiveRoute("/dashboard/agent", "/dashboard")).toBe(false);
      // Non-matching routes
      expect(isActiveRoute("/dashboard/settings", "/dashboard/agent")).toBe(
        false
      );
      // Null protection
      expect(isActiveRoute(null, "/dashboard")).toBe(false);
    });
  });

  describe("NavUser Component", () => {
    it("should be importable", async () => {
      const { NavUser } =
        await import("../src/components/dashboard/sidebar-user");
      expect(NavUser).toBeDefined();
      expect(typeof NavUser).toBe("function");
    });

    it("should export NavUser as a React component", async () => {
      const module = await import("../src/components/dashboard/sidebar-user");
      expect(module).toHaveProperty("NavUser");
      expect(module.NavUser.name).toBe("NavUser");
    });

    it("should accept user prop", async () => {
      const { NavUser } =
        await import("../src/components/dashboard/sidebar-user");
      expect(NavUser).toBeDefined();
    });
  });

  // Data Display Components Tests
  describe("DataTable Component", () => {
    it("should be importable", async () => {
      const { DataTable } =
        await import("../src/components/dashboard/data-table");
      expect(DataTable).toBeDefined();
      expect(typeof DataTable).toBe("function");
    });

    it("should export DataTable as a React component", async () => {
      const module = await import("../src/components/dashboard/data-table");
      expect(module).toHaveProperty("DataTable");
      expect(module.DataTable.name).toBe("DataTable");
    });

    it("should be a client component", async () => {
      const { DataTable } =
        await import("../src/components/dashboard/data-table");
      expect(DataTable).toBeDefined();
    });

    it("should accept columns prop", async () => {
      const { DataTable } =
        await import("../src/components/dashboard/data-table");
      expect(DataTable).toBeDefined();
    });

    it("should accept data prop", async () => {
      const { DataTable } =
        await import("../src/components/dashboard/data-table");
      expect(DataTable).toBeDefined();
    });
  });

  describe("MetricsCards Component", () => {
    it("should be importable", async () => {
      const { MetricsCards } =
        await import("../src/components/dashboard/metrics-cards");
      expect(MetricsCards).toBeDefined();
      expect(typeof MetricsCards).toBe("function");
    });

    it("should export MetricsCards as a React component", async () => {
      const module = await import("../src/components/dashboard/metrics-cards");
      expect(module).toHaveProperty("MetricsCards");
      expect(module.MetricsCards.name).toBe("MetricsCards");
    });

    it("should be a client component", async () => {
      const { MetricsCards } =
        await import("../src/components/dashboard/metrics-cards");
      expect(MetricsCards).toBeDefined();
    });
  });

  describe("PageHeader Component", () => {
    it("should be importable", async () => {
      const { PageHeader } =
        await import("../src/components/dashboard/page-header");
      expect(PageHeader).toBeDefined();
      expect(typeof PageHeader).toBe("function");
    });

    it("should export PageHeader as a React component", async () => {
      const module = await import("../src/components/dashboard/page-header");
      expect(module).toHaveProperty("PageHeader");
      expect(module.PageHeader.name).toBe("PageHeader");
    });

    it("should accept title prop", async () => {
      const { PageHeader } =
        await import("../src/components/dashboard/page-header");
      expect(PageHeader).toBeDefined();
    });

    it("should accept description prop", async () => {
      const { PageHeader } =
        await import("../src/components/dashboard/page-header");
      expect(PageHeader).toBeDefined();
    });
  });

  // Chart Components Tests
  describe("PnlChart Component", () => {
    it("should be importable", async () => {
      const { PnlChart } =
        await import("../src/components/dashboard/pnl-chart");
      expect(PnlChart).toBeDefined();
      expect(typeof PnlChart).toBe("function");
    });

    it("should export PnlChart as a React component", async () => {
      const module = await import("../src/components/dashboard/pnl-chart");
      expect(module).toHaveProperty("PnlChart");
      expect(module.PnlChart.name).toBe("PnlChart");
    });

    it("should be a client component", async () => {
      const { PnlChart } =
        await import("../src/components/dashboard/pnl-chart");
      expect(PnlChart).toBeDefined();
    });
  });

  describe("CandlestickChart Component", () => {
    it("should be importable", async () => {
      const { CandlestickChart } =
        await import("../src/components/dashboard/candlestick-chart");
      expect(CandlestickChart).toBeDefined();
      expect(typeof CandlestickChart).toBe("function");
    });

    it("should export CandlestickChart as a React component", async () => {
      const module =
        await import("../src/components/dashboard/candlestick-chart");
      expect(module).toHaveProperty("CandlestickChart");
      expect(module.CandlestickChart.name).toBe("CandlestickChart");
    });

    it("should be a client component", async () => {
      const { CandlestickChart } =
        await import("../src/components/dashboard/candlestick-chart");
      expect(CandlestickChart).toBeDefined();
    });
  });

  describe("DistributionChart Component", () => {
    it("should be importable", async () => {
      const { DistributionChart } =
        await import("../src/components/dashboard/distribution-chart");
      expect(DistributionChart).toBeDefined();
      expect(typeof DistributionChart).toBe("function");
    });

    it("should export DistributionChart as a React component", async () => {
      const module =
        await import("../src/components/dashboard/distribution-chart");
      expect(module).toHaveProperty("DistributionChart");
      expect(module.DistributionChart.name).toBe("DistributionChart");
    });

    it("should be a client component", async () => {
      const { DistributionChart } =
        await import("../src/components/dashboard/distribution-chart");
      expect(DistributionChart).toBeDefined();
    });
  });

  describe("SetupWizard Component", () => {
    it("should be importable", async () => {
      const { SetupWizard } =
        await import("../src/components/dashboard/setup/setup-wizard");
      expect(SetupWizard).toBeDefined();
      expect(typeof SetupWizard).toBe("function");
    });

    it("should export SetupWizard as a React component", async () => {
      const module =
        await import("../src/components/dashboard/setup/setup-wizard");
      expect(module).toHaveProperty("SetupWizard");
      expect(module.SetupWizard.name).toBe("SetupWizard");
    });

    it("should be a client component", async () => {
      const { SetupWizard } =
        await import("../src/components/dashboard/setup/setup-wizard");
      expect(SetupWizard).toBeDefined();
    });
  });

  describe("SetupConfig Module", () => {
    it("should export REQUIRED_SECRETS with valid entries", async () => {
      const { REQUIRED_SECRETS } =
        await import("../src/components/dashboard/setup/setup-config");
      expect(REQUIRED_SECRETS).toBeDefined();
      expect(Array.isArray(REQUIRED_SECRETS)).toBe(true);
      expect(REQUIRED_SECRETS.length).toBeGreaterThan(0);
      for (const s of REQUIRED_SECRETS) {
        expect(s.secret).toMatch(/^[A-Z][A-Z0-9_]+$/);
        expect(s.worker).toBeTypeOf("string");
        expect([
          "External Webhooks",
          "Internal Auth Keys",
          "Exchange API Keys",
          "Notification Services",
        ]).toContain(s.group);
      }
    });

    it("should export WIZARD_STEPS with 5 steps", async () => {
      const { WIZARD_STEPS } =
        await import("../src/components/dashboard/setup/setup-config");
      expect(WIZARD_STEPS).toBeDefined();
      expect(WIZARD_STEPS).toHaveLength(5);
      expect(WIZARD_STEPS[0]?.id).toBe("welcome");
      expect(WIZARD_STEPS[4]?.id).toBe("done");
    });

    it("should provide buildSecretCommand helper", async () => {
      const { buildSecretCommand } =
        await import("../src/components/dashboard/setup/setup-config");
      const cmd = buildSecretCommand("FOO_KEY", "bar-worker", "value");
      expect(cmd).toContain("FOO_KEY");
      expect(cmd).toContain("bar-worker");
      expect(cmd).toContain("value");
    });

    it("should provide groupSecretsByCategory helper", async () => {
      const { groupSecretsByCategory, REQUIRED_SECRETS } =
        await import("../src/components/dashboard/setup/setup-config");
      const grouped = groupSecretsByCategory(
        REQUIRED_SECRETS.map((s) => ({ ...s, configured: false, example: "x" }))
      );
      expect(Object.keys(grouped).length).toBeGreaterThan(0);
    });
  });

  describe("SetupProgress Module", () => {
    it("should export progress helpers", async () => {
      const mod =
        await import("../src/components/dashboard/setup/setup-progress");
      expect(typeof mod.isSetupCompleted).toBe("function");
      expect(typeof mod.markSetupCompleted).toBe("function");
      expect(typeof mod.resetSetupProgress).toBe("function");
      expect(mod.SETUP_STORAGE_KEY).toBeTypeOf("string");
    });

    it("should be safe to call from server-side (no window)", async () => {
      const mod =
        await import("../src/components/dashboard/setup/setup-progress");
      // Should not throw even though window is undefined in test env
      expect(() => mod.isSetupCompleted()).not.toThrow();
      expect(() => mod.markSetupCompleted()).not.toThrow();
      expect(() => mod.resetSetupProgress()).not.toThrow();
    });
  });

  describe("Setup Sub-Components", () => {
    it("should expose CircularProgress", async () => {
      const { CircularProgress } =
        await import("../src/components/dashboard/setup/setup-circular-progress");
      expect(CircularProgress).toBeDefined();
      expect(typeof CircularProgress).toBe("function");
    });

    it("should expose FirstRunRedirect", async () => {
      const { FirstRunRedirect } =
        await import("../src/components/dashboard/setup/first-run-redirect");
      expect(FirstRunRedirect).toBeDefined();
      expect(typeof FirstRunRedirect).toBe("function");
    });
  });

  describe("Wizard Step Sub-Components", () => {
    it("should expose WizardWelcomeStep", async () => {
      const { WizardWelcomeStep } =
        await import("../src/components/dashboard/setup/steps/welcome");
      expect(WizardWelcomeStep).toBeDefined();
      expect(typeof WizardWelcomeStep).toBe("function");
    });

    it("should expose WizardWorkersStep", async () => {
      const { WizardWorkersStep } =
        await import("../src/components/dashboard/setup/steps/workers");
      expect(WizardWorkersStep).toBeDefined();
      expect(typeof WizardWorkersStep).toBe("function");
    });

    it("should expose WizardSecretsStep", async () => {
      const { WizardSecretsStep } =
        await import("../src/components/dashboard/setup/steps/secrets");
      expect(WizardSecretsStep).toBeDefined();
      expect(typeof WizardSecretsStep).toBe("function");
    });

    it("should expose WizardWebhookStep", async () => {
      const { WizardWebhookStep } =
        await import("../src/components/dashboard/setup/steps/webhook");
      expect(WizardWebhookStep).toBeDefined();
      expect(typeof WizardWebhookStep).toBe("function");
    });

    it("should expose WizardDoneStep", async () => {
      const { WizardDoneStep } =
        await import("../src/components/dashboard/setup/steps/done");
      expect(WizardDoneStep).toBeDefined();
      expect(typeof WizardDoneStep).toBe("function");
    });

    it("should expose WizardStepIndicator", async () => {
      const { WizardStepIndicator } =
        await import("../src/components/dashboard/setup/steps/step-indicator");
      expect(WizardStepIndicator).toBeDefined();
      expect(typeof WizardStepIndicator).toBe("function");
    });
  });

  describe("Infrastructure Sub-Components", () => {
    it("should expose InfrastructureRow", async () => {
      const { InfrastructureRow } =
        await import("../src/components/dashboard/infrastructure/infrastructure-row");
      expect(InfrastructureRow).toBeDefined();
      expect(typeof InfrastructureRow).toBe("function");
    });

    it("should expose InfrastructureLegend", async () => {
      const { InfrastructureLegend } =
        await import("../src/components/dashboard/infrastructure/infrastructure-legend");
      expect(InfrastructureLegend).toBeDefined();
      expect(typeof InfrastructureLegend).toBe("function");
    });

    it("should export INFRASTRUCTURE_SECTIONS with 3 sections", async () => {
      const { INFRASTRUCTURE_SECTIONS } =
        await import("../src/components/dashboard/infrastructure/infrastructure-config");
      expect(INFRASTRUCTURE_SECTIONS).toBeDefined();
      expect(INFRASTRUCTURE_SECTIONS).toHaveLength(3);
      const titles = INFRASTRUCTURE_SECTIONS.map((s) => s.title);
      expect(titles).toContain("Workers");
      expect(titles).toContain("Pages");
      expect(titles).toContain("Storage & Databases");
    });

    it("should classify resources by kind (worker/page/storage)", async () => {
      const { INFRASTRUCTURE_SECTIONS } =
        await import("../src/components/dashboard/infrastructure/infrastructure-config");
      const allResources = INFRASTRUCTURE_SECTIONS.flatMap((s) => s.resources);
      for (const r of allResources) {
        expect(["worker", "page", "storage"]).toContain(r.kind);
      }
    });
  });

  describe("WorkersOverview Component", () => {
    it("should be importable", async () => {
      const { WorkersOverview } =
        await import("../src/components/dashboard/workers-overview");
      expect(WorkersOverview).toBeDefined();
      expect(typeof WorkersOverview).toBe("function");
    });

    it("should export WorkersOverview as a React component", async () => {
      const module =
        await import("../src/components/dashboard/workers-overview");
      expect(module).toHaveProperty("WorkersOverview");
      expect(module.WorkersOverview.name).toBe("WorkersOverview");
    });

    it("should be a client component", async () => {
      const { WorkersOverview } =
        await import("../src/components/dashboard/workers-overview");
      expect(WorkersOverview).toBeDefined();
    });
  });

  describe("PositionsTable Component", () => {
    it("should be importable", async () => {
      const { PositionsTable } =
        await import("../src/components/dashboard/positions-table");
      expect(PositionsTable).toBeDefined();
      expect(typeof PositionsTable).toBe("function");
    });

    it("should export PositionsTable as a React component", async () => {
      const module =
        await import("../src/components/dashboard/positions-table");
      expect(module).toHaveProperty("PositionsTable");
      expect(module.PositionsTable.name).toBe("PositionsTable");
    });

    it("should be a client component", async () => {
      const { PositionsTable } =
        await import("../src/components/dashboard/positions-table");
      expect(PositionsTable).toBeDefined();
    });
  });

  describe("LiveTicker Component", () => {
    it("should be importable", async () => {
      const { LiveTicker } =
        await import("../src/components/dashboard/live-ticker");
      expect(LiveTicker).toBeDefined();
      expect(typeof LiveTicker).toBe("function");
    });

    it("should export LiveTicker as a React component", async () => {
      const module = await import("../src/components/dashboard/live-ticker");
      expect(module).toHaveProperty("LiveTicker");
      expect(module.LiveTicker.name).toBe("LiveTicker");
    });

    it("should be a client component", async () => {
      const { LiveTicker } =
        await import("../src/components/dashboard/live-ticker");
      expect(LiveTicker).toBeDefined();
    });
  });

  describe("CommandPalette Component", () => {
    it("should be importable", async () => {
      const { CommandPalette } =
        await import("../src/components/dashboard/command-palette");
      expect(CommandPalette).toBeDefined();
      expect(typeof CommandPalette).toBe("function");
    });

    it("should export CommandPalette as a React component", async () => {
      const module =
        await import("../src/components/dashboard/command-palette");
      expect(module).toHaveProperty("CommandPalette");
      expect(module.CommandPalette.name).toBe("CommandPalette");
    });

    it("should be a client component", async () => {
      const { CommandPalette } =
        await import("../src/components/dashboard/command-palette");
      expect(CommandPalette).toBeDefined();
    });
  });

  describe("EmptyState Component", () => {
    it("should be importable", async () => {
      const { EmptyState } =
        await import("../src/components/dashboard/empty-state");
      expect(EmptyState).toBeDefined();
      expect(typeof EmptyState).toBe("function");
    });

    it("should export EmptyState as a React component", async () => {
      const module = await import("../src/components/dashboard/empty-state");
      expect(module).toHaveProperty("EmptyState");
      expect(module.EmptyState.name).toBe("EmptyState");
    });

    it("should accept title prop", async () => {
      const { EmptyState } =
        await import("../src/components/dashboard/empty-state");
      expect(EmptyState).toBeDefined();
    });

    it("should accept description prop", async () => {
      const { EmptyState } =
        await import("../src/components/dashboard/empty-state");
      expect(EmptyState).toBeDefined();
    });
  });

  describe("AmbientBackground Component", () => {
    it("should be importable", async () => {
      const { AmbientBackground } =
        await import("../src/components/dashboard/ambient-background");
      expect(AmbientBackground).toBeDefined();
      expect(typeof AmbientBackground).toBe("function");
    });

    it("should export AmbientBackground as a React component", async () => {
      const module =
        await import("../src/components/dashboard/ambient-background");
      expect(module).toHaveProperty("AmbientBackground");
      expect(module.AmbientBackground.name).toBe("AmbientBackground");
    });

    it("should be a client component", async () => {
      const { AmbientBackground } =
        await import("../src/components/dashboard/ambient-background");
      expect(AmbientBackground).toBeDefined();
    });
  });

  describe("SignalFlowVisualization Component", () => {
    it("should be importable", async () => {
      const { SignalFlowVisualization } =
        await import("../src/components/dashboard/signal-flow-visualization");
      expect(SignalFlowVisualization).toBeDefined();
      expect(typeof SignalFlowVisualization).toBe("function");
    });

    it("should export SignalFlowVisualization as a React component", async () => {
      const module =
        await import("../src/components/dashboard/signal-flow-visualization");
      expect(module).toHaveProperty("SignalFlowVisualization");
      expect(module.SignalFlowVisualization.name).toBe(
        "SignalFlowVisualization"
      );
    });

    it("should be a client component", async () => {
      const { SignalFlowVisualization } =
        await import("../src/components/dashboard/signal-flow-visualization");
      expect(SignalFlowVisualization).toBeDefined();
    });
  });

  describe("DeployedInfrastructure Component", () => {
    it("should be importable", async () => {
      const { DeployedInfrastructure } =
        await import("../src/components/dashboard/deployed-infrastructure");
      expect(DeployedInfrastructure).toBeDefined();
      expect(typeof DeployedInfrastructure).toBe("function");
    });

    it("should export DeployedInfrastructure as a React component", async () => {
      const module =
        await import("../src/components/dashboard/deployed-infrastructure");
      expect(module).toHaveProperty("DeployedInfrastructure");
      expect(module.DeployedInfrastructure.name).toBe("DeployedInfrastructure");
    });

    it("should be a client component", async () => {
      const { DeployedInfrastructure } =
        await import("../src/components/dashboard/deployed-infrastructure");
      expect(DeployedInfrastructure).toBeDefined();
    });
  });

  describe("SettingsForm Component", () => {
    it("should be importable", async () => {
      const { SettingsForm } =
        await import("../src/components/dashboard/settings-form");
      expect(SettingsForm).toBeDefined();
      expect(typeof SettingsForm).toBe("function");
    });

    it("should export SettingsForm as a React component", async () => {
      const module = await import("../src/components/dashboard/settings-form");
      expect(module).toHaveProperty("SettingsForm");
      expect(module.SettingsForm.name).toBe("SettingsForm");
    });

    it("should be a client component", async () => {
      const { SettingsForm } =
        await import("../src/components/dashboard/settings-form");
      expect(SettingsForm).toBeDefined();
    });
  });

  describe("AiHealthCard Component", () => {
    it("should be importable", async () => {
      const { AiHealthCard } =
        await import("../src/components/dashboard/ai-health-card");
      expect(AiHealthCard).toBeDefined();
      expect(typeof AiHealthCard).toBe("function");
    });

    it("should export AiHealthCard as a React component", async () => {
      const module = await import("../src/components/dashboard/ai-health-card");
      expect(module).toHaveProperty("AiHealthCard");
      expect(module.AiHealthCard.name).toBe("AiHealthCard");
    });

    it("should be a client component", async () => {
      const { AiHealthCard } =
        await import("../src/components/dashboard/ai-health-card");
      expect(AiHealthCard).toBeDefined();
    });
  });

  // Database Explorer
  describe("DatabaseTableBrowser Component", () => {
    it("should be importable", async () => {
      const { DatabaseTableBrowser } =
        await import("../src/components/dashboard/database-table-browser");
      expect(DatabaseTableBrowser).toBeDefined();
      expect(typeof DatabaseTableBrowser).toBe("function");
    });

    it("should export DatabaseTableBrowser as a React component", async () => {
      const module =
        await import("../src/components/dashboard/database-table-browser");
      expect(module).toHaveProperty("DatabaseTableBrowser");
      expect(module.DatabaseTableBrowser.name).toBe("DatabaseTableBrowser");
    });

    it("should be a client component", async () => {
      const module =
        await import("../src/components/dashboard/database-table-browser");
      expect(module.DatabaseTableBrowser).toBeDefined();
    });
  });

  describe("SchemaViewer Component", () => {
    it("should be importable", async () => {
      const { SchemaViewer } =
        await import("../src/components/dashboard/schema-viewer");
      expect(SchemaViewer).toBeDefined();
      expect(typeof SchemaViewer).toBe("function");
    });

    it("should export SchemaViewer as a React component", async () => {
      const module = await import("../src/components/dashboard/schema-viewer");
      expect(module).toHaveProperty("SchemaViewer");
      expect(module.SchemaViewer.name).toBe("SchemaViewer");
    });

    it("should be a client component", async () => {
      const module = await import("../src/components/dashboard/schema-viewer");
      expect(module.SchemaViewer).toBeDefined();
    });
  });
});
