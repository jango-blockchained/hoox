/** @jsxImportSource @opentui/react */
/**
 * Settings View — 4-column layout for user preferences.
 *
 * Columns:
 *   1. ThemePanel    — dark-only note, refresh rate, default view, reset + connection readout
 *   2. NotificationsPanel — alert/trade/debug/system checkboxes, sound toggle
 *   3. KeyboardPanel — read-only shortcut reference table
 *   4. DataPanel     — cache/export/import actions + About info
 *
 * Reads/writes the Zustand config store (@jango-blockchained/hoox-shared/stores/config-store).
 * Keyboard: Tab cycles panels, ↑↓ navigates items within panel,
 *           Space toggles, ←→ cycles selects, Enter activates buttons.
 *
 * Follows Pattern 1 (View Composition) and Pattern 2 (Store Subscription).
 */
import { useMemo, useState, useCallback, useEffect } from "react";
import { useKeyboard } from "@opentui/react";
import {
  Colors,
  useServiceStore,
  useUIStore,
  useConfigStore,
  readConfigSync,
} from "@jango-blockchained/hoox-shared";
import { ErrorBoundary } from "../shared/error-boundary";
import { ViewHeader } from "../shared/view-header";
import { Panel } from "../shared/panel";
import { showConfirm } from "../ui/dialog";
import type { DialogHandle } from "../ui/dialog";
import { cliBridge } from "../../services/cli-bridge";
import { getSettingsConnectionSnapshot } from "../../services/tui-connection";
import * as path from "path";
import * as os from "os";
import type {
  ViewId,
  NotificationPreferences,
} from "@jango-blockchained/hoox-shared";

export interface SettingsViewProps {
  /** Dialog handle for destructive action confirmation. */
  dialog?: DialogHandle;
}

// ─── Check Setup Types ────────────────────────────────────────────────────────

/**
 * Local mirror of the CLI's CheckReport shape (`packages/cli/src/commands/check/types.ts`).
 * We re-declare the shape here because that type isn't exported from the
 * shared package — the CLI's CheckReport flows over the wire as JSON, and
 * `cliBridge.checkSetup()` returns it as `unknown`. Validating at the boundary
 * keeps the view decoupled from the CLI's internal type module.
 */
interface CheckItem {
  /** Human-readable check name (e.g. "D1 Database", "Wrangler Configs"). */
  name: string;
  /** Whether this check passed (no errors). */
  success: boolean;
  /** Failing conditions — must be addressed before deployment. */
  errors: string[];
  /** Non-blocking issues — should be reviewed. */
  warnings: string[];
}

interface CheckCategoryResult {
  /** Category label displayed in the report. */
  name: string;
  /** Per-check results within this category. */
  checks: CheckItem[];
}

interface CheckReport {
  /** True when every check in every category passed (zero errors). */
  success: boolean;
  /** Grouped category results. */
  categories: CheckCategoryResult[];
  /** Aggregated counts across all checks. */
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
}

/** UI state for the Check Setup results panel. */
type CheckSetupState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "error"; message: string }
  | { kind: "report"; report: CheckReport; durationMs: number };

/**
 * Human-readable explanation + suggested fix for each known check.
 * Used by the results panel to give operators actionable guidance when
 * a check fails. Keys must match the `name` field of CLI's CheckResult.
 */
const SUGGESTED_FIXES: Record<string, { what: string; fix: string }> = {
  "wrangler.jsonc validation": {
    what: "Your wrangler.jsonc has invalid syntax or is missing required fields.",
    fix: "Run `hoox init` to regenerate the config, or fix syntax errors manually.",
  },
  "Global config": {
    what: "Required global fields (cloudflare_account_id, etc.) are missing.",
    fix:
      "Set `global.cloudflare_account_id` in wrangler.jsonc, and " +
      "`global.cloudflare_api_token` via `wrangler secret put`.",
  },
  "Worker paths": {
    what: "One or more workers have no `path` field in the config.",
    fix: "Add a `path` field to each worker entry, or run `hoox init` to repair.",
  },
  "D1 Database": {
    what: "Required D1 databases are missing from Cloudflare.",
    fix: "Run `hoox infra provision` to create them automatically.",
  },
  "KV Namespaces": {
    what: "Required KV namespaces are missing from Cloudflare.",
    fix: "Run `hoox infra provision` to create them automatically.",
  },
  "R2 Buckets": {
    what: "Required R2 buckets are missing from Cloudflare.",
    fix: "Run `hoox infra provision` to create them automatically.",
  },
  Queues: {
    what: "Required Cloudflare Queues are missing.",
    fix: "Run `hoox infra provision` to create them automatically.",
  },
  "Secrets (local)": {
    what: "Local .dev.vars files are missing required secrets.",
    fix: "Run `hoox check fix` to create placeholder files, then fill in real values.",
  },
  "Secrets (remote)": {
    what: "Remote Cloudflare secrets are missing for one or more workers.",
    fix: "Run `hoox secrets update-cf` to push local secrets to Cloudflare.",
  },
  Database: {
    what: "Required D1 database tables or schemas are missing.",
    fix: "Run `hoox infra provision` and apply D1 migrations.",
  },
};

/** Fallback explanation when a check name is not in the SUGGESTED_FIXES map. */
const GENERIC_FAIL_HELP = {
  what: "This check reported one or more errors.",
  fix: "Review the error details below, then re-run `hoox check setup` after fixing.",
};

// ─── Constants ────────────────────────────────────────────────────────────────

/** Refresh rate options in milliseconds */
const REFRESH_RATES = [250, 500, 1000, 2000, 5000] as const;

/** Refresh rate display labels */
function formatRefreshRate(ms: number): string {
  if (ms >= 1000) return `${ms / 1000}s`;
  return `${ms}ms`;
}

/** ViewId options for the default view selector */
const VIEW_OPTIONS: ViewId[] = [
  "dashboard",
  "workers",
  "worker-detail",
  "trade-monitor",
  "logs-viewer",
  "service-manager",
  "config-editor",
  "setup-wizard",
  "settings",
  "queue-depth",
  "kv-viewer",
  "secrets-viewer",
  "db-query",
  "ai-chat",
  "edge-topology",
  "worker-settings",
];

/** Human-readable labels for ViewId values */
const VIEW_LABELS: Record<ViewId, string> = {
  dashboard: "Dashboard",
  workers: "Workers Overview",
  "worker-detail": "Worker Detail",
  "trade-monitor": "Trade Monitor",
  "logs-viewer": "Logs Viewer",
  "service-manager": "Service Manager",
  "config-editor": "Config Editor",
  "setup-wizard": "Setup Wizard",
  settings: "Settings",
  "queue-depth": "Queue Depth",
  "kv-viewer": "KV Viewer",
  "secrets-viewer": "Secrets Viewer",
  "db-query": "DB Query",
  "ai-chat": "AI Chat",
  "edge-topology": "Edge Topology",
  "worker-settings": "Worker Settings",
};

/** Notification channel keys in display order */
const NOTIFICATION_CHANNELS: (keyof NotificationPreferences)[] = [
  "alerts",
  "trades",
  "debug",
  "system",
];

/** Human-readable labels for notification channels */
const NOTIFICATION_LABELS: Record<keyof NotificationPreferences, string> = {
  alerts: "ALERTS",
  trades: "TRADES",
  debug: "DEBUG",
  system: "SYSTEM",
};

/** System-level keyboard shortcuts shown in the reference panel */
interface ShortcutEntry {
  key: string;
  action: string;
}

const SYSTEM_SHORTCUTS: ShortcutEntry[] = [
  { key: "Ctrl+1..9", action: "Switch to view 1-9" },
  { key: "Ctrl+0", action: "Switch to view 10" },
  // Keep action labels short — Keyboard panel is ~34 cols; long text
  // overflows into adjacent panels and corrupts the character frame.
  { key: "Ctrl+Alt+W", action: "Worker Settings" },
  { key: "Ctrl+P", action: "Command Palette" },
  { key: "Ctrl+B", action: "Toggle Sidebar" },
  { key: "Ctrl+Q", action: "Quit" },
  { key: "Esc", action: "Back / Close" },
  { key: "Tab", action: "Next panel / field" },
  { key: "/", action: "Focus search" },
  { key: "Space", action: "Toggle checkbox" },
];

// ─── Panel Count ──────────────────────────────────────────────────────────────

const PANEL_COUNT = 4;

// ─── Sub-Components ────────────────────────────────────────────────────────────

/**
 * Toggle checkbox: "[x]" for checked, "[ ]" for unchecked.
 * Responds to Space and mouse click.
 */
function Checkbox({
  label,
  checked,
  onToggle,
  active,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  active: boolean;
}) {
  const marker = checked ? "x" : " ";
  return (
    <text
      fg={checked ? Colors.success : Colors.muted}
      bg={active ? Colors.background : undefined}
      bold={checked}
      dim={!checked}
      onMouseUp={onToggle}
    >
      [{marker}] {label}
    </text>
  );
}

// ─── Column 1: ThemePanel ─────────────────────────────────────────────────────

/**
 * ThemePanel — dark-only theme note, refresh rate, default view, reset,
 * plus a read-only connection/transport snapshot.
 *
 * Local item indices for keyboard navigation:
 *   0 = refresh rate, 1 = default view, 2 = reset button
 * (theme is display-only; connection is read-only)
 */
const THEME_ITEM_COUNT = 3;

function ThemePanel({
  active,
  activeItem,
  onResetDefaults,
}: {
  active: boolean;
  activeItem: number;
  onResetDefaults: () => void;
}) {
  const refreshIntervalMs = useConfigStore((s) => s.refreshIntervalMs);
  const defaultView = useConfigStore((s) => s.defaultView);

  const connection = useMemo(() => {
    let configFallback: {
      transport?: string;
      apiUrl?: string;
      apiToken?: string;
    } = {};
    try {
      const cfg = readConfigSync();
      configFallback = {
        transport: cfg.transport,
        apiUrl: cfg.apiUrl,
        apiToken: cfg.apiToken,
      };
    } catch {
      // config.json may be missing — env-only snapshot is fine
    }
    return getSettingsConnectionSnapshot(process.env, configFallback);
  }, []);

  return (
    <box flexDirection="column" gap={0} paddingX={1}>
      {/* Dark-only theme (panel title is THEME; light not implemented) */}
      <text fg={Colors.accent} bold>
        (•) DARK
      </text>
      <text fg={Colors.muted} dim>
        Light not implemented
      </text>

      {/* Refresh rate selector */}
      <text fg={Colors.foreground} bold dim>
        REFRESH
      </text>
      <text
        fg={Colors.accent}
        bg={active && activeItem === 0 ? Colors.background : undefined}
        bold
      >
        {"◀ "}
        {formatRefreshRate(refreshIntervalMs)}
        {" ▶"}
      </text>

      {/* Default view dropdown */}
      <text fg={Colors.foreground} bold dim>
        DEFAULT VIEW
      </text>
      <text
        fg={Colors.accent}
        bg={active && activeItem === 1 ? Colors.background : undefined}
        bold
      >
        {"◀ "}
        {VIEW_LABELS[defaultView] ?? defaultView}
        {" ▶"}
      </text>

      {/* Reset to Defaults */}
      <text
        fg={Colors.warning}
        bg={active && activeItem === 2 ? Colors.background : undefined}
        bold
        onMouseUp={onResetDefaults}
      >
        {"[ RESET TO DEFAULTS ]"}
      </text>

      {/* Connection / transport (read-only; secrets never shown) */}
      <text fg={Colors.foreground} bold dim>
        CONNECTION
      </text>
      <text
        fg={
          connection.mode === "remote"
            ? Colors.info
            : Colors["muted-foreground"]
        }
        bold
      >
        {connection.mode.toUpperCase()} · {connection.apiHost}
      </text>
      <text fg={Colors.accent}>
        {connection.transport} · Auth {connection.authSummary}
      </text>
      <text fg={Colors.dim} dim>
        {connection.hint}
      </text>
    </box>
  );
}

// ─── Column 2: NotificationsPanel ─────────────────────────────────────────────

/**
 * NotificationsPanel — toggle checkboxes for alert/trade/debug/system
 * notification channels plus a master sound toggle.
 *
 * Local item indices:
 *   0-3 = notification channels, 4 = sound toggle
 */
const NOTIF_ITEM_COUNT = 5;

function NotificationsPanel({
  active,
  activeItem,
}: {
  active: boolean;
  activeItem: number;
}) {
  const notifications = useConfigStore((s) => s.notifications);
  const soundEnabled = useConfigStore((s) => s.soundEnabled);
  const toggleNotification = useConfigStore((s) => s.toggleNotification);
  const updateConfig = useConfigStore((s) => s.updateConfig);

  return (
    <box flexDirection="column" gap={0}>
      {/* Notification checkboxes */}
      <text fg={Colors.foreground} bold dim>
        CHANNELS
      </text>
      {NOTIFICATION_CHANNELS.map((channel, i) => (
        <Checkbox
          key={channel}
          label={NOTIFICATION_LABELS[channel]}
          checked={notifications[channel]}
          onToggle={() => toggleNotification(channel)}
          active={active && activeItem === i}
        />
      ))}

      {/* Sound toggle */}
      <box paddingTop={1}>
        <Checkbox
          label="SOUND"
          checked={soundEnabled}
          onToggle={() => updateConfig({ soundEnabled: !soundEnabled })}
          active={active && activeItem === 4}
        />
      </box>
    </box>
  );
}

// ─── Column 3: KeyboardPanel ──────────────────────────────────────────────────

/**
 * KeyboardPanel — read-only reference table showing system-level
 * keyboard shortcuts (key → action).
 */
function KeyboardPanel() {
  return (
    <box flexDirection="column" gap={0}>
      <text fg={Colors.foreground} bold dim>
        KEY
        {"  "}
        ACTION
      </text>

      {SYSTEM_SHORTCUTS.map((entry) => (
        <box key={entry.key} flexDirection="row" gap={1}>
          <text fg={Colors.accent} bold>
            {entry.key.padEnd(14)}
          </text>
          <text fg={Colors.muted} dim>
            {entry.action}
          </text>
        </box>
      ))}

      {/* Divider + hint */}
      <box paddingTop={1}>
        <text fg={Colors.dim} dim>
          These shortcuts are global and cannot be changed.
        </text>
      </box>
    </box>
  );
}

// ─── Column 4: DataPanel ──────────────────────────────────────────────────────

/**
 * DataPanel — data management actions (Clear Cache, Export, Import, Check Setup, Auto-Repair)
 * plus an About section with version and tech info.
 *
 * Local item indices:
 *   0 = Clear Cache, 1 = Export Data, 2 = Import Data, 3 = Check Setup, 4 = Run Auto-Repair
 */
const DATA_ITEM_COUNT = 5;

function DataPanel({
  active,
  activeItem,
  onClearCache,
  onExportData,
  onImportData,
  onCheckSetup,
  onRunAutoRepair,
}: {
  active: boolean;
  activeItem: number;
  onClearCache: () => void;
  onExportData: () => void;
  onImportData: () => void;
  onCheckSetup: () => void;
  onRunAutoRepair: () => void;
}) {
  return (
    <box flexDirection="column" gap={0} flexGrow={1}>
      {/* Data management header */}
      <text fg={Colors.foreground} bold dim>
        DATA MANAGEMENT
      </text>

      {/* Action buttons */}
      <box flexDirection="column" gap={0} paddingLeft={1}>
        <text
          fg={Colors.accent}
          bg={active && activeItem === 0 ? Colors.background : undefined}
          bold
          onMouseUp={onClearCache}
        >
          [ CLEAR CACHE ]
        </text>
        <text
          fg={Colors.accent}
          bg={active && activeItem === 1 ? Colors.background : undefined}
          bold
          onMouseUp={onExportData}
        >
          [ EXPORT DATA ]
        </text>
        <text
          fg={Colors.accent}
          bg={active && activeItem === 2 ? Colors.background : undefined}
          bold
          onMouseUp={onImportData}
        >
          [ IMPORT DATA ]
        </text>
        <text
          fg={Colors.warning}
          bg={active && activeItem === 3 ? Colors.background : undefined}
          bold
          onMouseUp={onCheckSetup}
        >
          [ CHECK SETUP ]
        </text>
        <text
          fg={Colors.info}
          bg={active && activeItem === 4 ? Colors.background : undefined}
          bold
          onMouseUp={onRunAutoRepair}
        >
          [ AUTO-REPAIR ]
        </text>
      </box>

      {/* About section */}
      <box paddingTop={1}>
        <text fg={Colors.foreground} bold dim>
          ABOUT
        </text>
      </box>
      <box flexDirection="column" gap={0} paddingLeft={1}>
        <text fg={Colors.foreground} bold>
          HOOX CLI v1.0.0
        </text>
        <text fg={Colors.muted} dim>
          OpenTUI + Bun
        </text>
        <text fg={Colors.info} dim>
          github.com/hoox/hoox-cli
        </text>
      </box>
    </box>
  );
}

// ─── Check Setup Results Panel ────────────────────────────────────────────────

/**
 * Status badge for a single check: PASS, FAIL, or WARN.
 * Renders as a colored bracketed tag so it's easy to scan in a long list.
 */
function CheckStatusBadge({ status }: { status: "pass" | "fail" | "warn" }) {
  if (status === "pass") {
    return (
      <text fg={Colors.success} bold>
        {"[PASS]"}
      </text>
    );
  }
  if (status === "fail") {
    return (
      <text fg={Colors.error} bold>
        {"[FAIL]"}
      </text>
    );
  }
  return (
    <text fg={Colors.warning} bold>
      {"[WARN]"}
    </text>
  );
}

/**
 * Status icon for a check row. Mirrors CheckStatusBadge but renders a
 * single character — used in compact lists where width is tight.
 */
function checkStatusIcon(check: CheckItem): "pass" | "fail" | "warn" {
  if (!check.success) return "fail";
  if (check.warnings.length > 0) return "warn";
  return "pass";
}

/**
 * Renders a single failed check's "what it means" + "suggested fix" section.
 * Only shown for failed checks; passes/warnings are listed without the
 * extra block to keep the panel scannable.
 */
function CheckFixHelp({ check }: { check: CheckItem }) {
  const help = SUGGESTED_FIXES[check.name] ?? GENERIC_FAIL_HELP;
  return (
    <box flexDirection="column" gap={0} paddingLeft={6}>
      <box>
        <text fg={Colors.foreground} dim>
          {"  what: "}
          {help.what}
        </text>
      </box>
      <box>
        <text fg={Colors.info} dim>
          {"  fix:  "}
          {help.fix}
        </text>
      </box>
    </box>
  );
}

/**
 * CheckSetupResultsPanel — renders a full CheckReport below the 4-column
 * settings layout. Shows a summary header, per-category sections, and a
 * per-check row with PASS/FAIL/WARN status. Failed checks include a
 * "what it means / suggested fix" block.
 *
 * Persists until the user dismisses with ESC or the [DISMISS] button.
 */
function CheckSetupResultsPanel({
  state,
  onDismiss,
  onRerun,
}: {
  state: CheckSetupState;
  onDismiss: () => void;
  onRerun: () => void;
}) {
  return (
    <box
      flexDirection="column"
      border={true}
      borderStyle="single"
      borderColor={Colors.accent}
      backgroundColor={Colors.card}
      paddingX={1}
      paddingY={0}
      gap={0}
    >
      {/* Header row: title + summary counts + dismiss button */}
      <box flexDirection="row" gap={2}>
        <text fg={Colors.accent} bold>
          SETUP CHECK RESULTS
        </text>
        {state.kind === "report" && (
          <>
            <text fg={Colors.success} bold>
              {state.report.summary.passed} passed
            </text>
            <text
              fg={state.report.summary.failed > 0 ? Colors.error : Colors.muted}
              bold={state.report.summary.failed > 0}
            >
              {state.report.summary.failed} failed
            </text>
            <text
              fg={
                state.report.summary.warnings > 0
                  ? Colors.warning
                  : Colors.muted
              }
              bold={state.report.summary.warnings > 0}
            >
              {state.report.summary.warnings} warnings
            </text>
            <text fg={Colors.muted} dim>
              {`(${(state.durationMs / 1000).toFixed(1)}s)`}
            </text>
          </>
        )}
        {state.kind === "running" && (
          <text fg={Colors.info} bold>
            running...
          </text>
        )}
        <text fg={Colors.muted}>{"  "}</text>
        <text fg={Colors.accent} bold onMouseUp={onRerun}>
          [ RE-RUN ]
        </text>
        <text fg={Colors.warning} bold onMouseUp={onDismiss}>
          [ DISMISS ]
        </text>
      </box>

      {/* Divider */}
      <box>
        <text fg={Colors.border} dim>
          {"─".repeat(80)}
        </text>
      </box>

      {/* Error state */}
      {state.kind === "error" && (
        <box flexDirection="column" gap={0} paddingTop={1}>
          <box>
            <text fg={Colors.error} bold>
              Setup check failed to run:
            </text>
          </box>
          <box>
            <text fg={Colors.foreground}>{state.message}</text>
          </box>
        </box>
      )}

      {/* Running state */}
      {state.kind === "running" && (
        <box flexDirection="column" gap={0} paddingTop={1}>
          <text fg={Colors.muted} dim>
            Running `hoox check setup` — this may take up to 20 seconds.
          </text>
        </box>
      )}

      {/* Report state — show all categories and checks */}
      {state.kind === "report" && (
        <box flexDirection="column" gap={0} paddingTop={1}>
          {state.report.categories.length === 0 ? (
            <box>
              <text fg={Colors.muted} dim>
                No checks were run.
              </text>
            </box>
          ) : (
            state.report.categories.map((cat) => (
              <box key={cat.name} flexDirection="column" gap={0} paddingTop={1}>
                {/* Category header */}
                <text fg={Colors.foreground} bold dim>
                  {cat.name.toUpperCase()}
                </text>
                {/* Each check in the category */}
                {cat.checks.map((check, idx) => {
                  const status = checkStatusIcon(check);
                  return (
                    <box
                      key={`${cat.name}-${idx}-${check.name}`}
                      flexDirection="column"
                      gap={0}
                    >
                      <box flexDirection="row" gap={1} paddingLeft={1}>
                        <box width={8}>
                          <CheckStatusBadge status={status} />
                        </box>
                        <text
                          fg={
                            status === "fail"
                              ? Colors.foreground
                              : Colors.foreground
                          }
                          bold={status === "fail"}
                        >
                          {check.name}
                        </text>
                      </box>
                      {/* Error details (one line each) */}
                      {check.errors.map((err, i) => (
                        <box key={`err-${idx}-${i}`} paddingLeft={6}>
                          <text fg={Colors.error}>
                            {"  - "}
                            {err}
                          </text>
                        </box>
                      ))}
                      {/* Warning details */}
                      {check.warnings.map((warn, i) => (
                        <box key={`warn-${idx}-${i}`} paddingLeft={6}>
                          <text fg={Colors.warning}>
                            {"  ~ "}
                            {warn}
                          </text>
                        </box>
                      ))}
                      {/* What it means + suggested fix (failures only) */}
                      {status === "fail" && <CheckFixHelp check={check} />}
                    </box>
                  );
                })}
              </box>
            ))
          )}
        </box>
      )}
    </box>
  );
}

// ─── Main View ─────────────────────────────────────────────────────────────────

/**
 * SettingsView — 4-column user preferences view.
 *
 * Keyboard model:
 *   Tab / Shift+Tab → cycle active panel (0-3)
 *   ↑↓              → navigate items within active panel
 *   Space            → toggle checkbox / select radio
 *   ←→              → cycle select values (refresh rate, default view)
 *   Enter            → activate button / toggle
 *
 * When the Check Setup results panel is visible, ESC dismisses it
 * (overrides the import-mode ESC handler).
 *
 * Wrapped in ErrorBoundary for crash recovery.
 */
export function SettingsView({ dialog }: SettingsViewProps = {}) {
  const activeView = useUIStore((s) => s.activeView);
  const isActive = activeView === "settings";

  const [activePanel, setActivePanel] = useState(0);
  const [activeItem, setActiveItem] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importPath, setImportPath] = useState("");
  const [setupCheck, setSetupCheck] = useState<CheckSetupState>({
    kind: "idle",
  });

  const updateConfig = useConfigStore((s) => s.updateConfig);
  const theme = useConfigStore((s) => s.theme);
  const refreshIntervalMs = useConfigStore((s) => s.refreshIntervalMs);
  const defaultView = useConfigStore((s) => s.defaultView);
  const resetDefaults = useConfigStore((s) => s.resetDefaults);
  const toggleNotification = useConfigStore((s) => s.toggleNotification);
  const soundEnabled = useConfigStore((s) => s.soundEnabled);

  // Light theme is not implemented — coerce any stored "light" to dark.
  useEffect(() => {
    if (theme === "light") {
      updateConfig({ theme: "dark" });
    }
  }, [theme, updateConfig]);

  /** Fail-closed confirm helper for destructive settings actions. */
  const confirmAction = useCallback(
    async (title: string, message: string, confirmLabel: string) => {
      if (!dialog) {
        useServiceStore.getState().addAlert({
          id: `settings-noconfirm-${Date.now()}`,
          type: "config",
          severity: "warning",
          message: `${title} blocked: confirmation dialog unavailable`,
          timestamp: Date.now(),
          acknowledged: false,
        });
        return false;
      }
      return showConfirm(dialog, {
        title,
        message,
        confirmLabel,
        cancelLabel: "Cancel",
      });
    },
    [dialog]
  );

  // ── Data panel handlers ────────────────────────────────────────────────────

  const handleClearCache = useCallback(async () => {
    const ok = await confirmAction(
      "Clear Cache?",
      "Delete ~/.hoox/cache? This cannot be undone.",
      "Clear Cache"
    );
    if (!ok) return;
    try {
      const cachePath = path.join(os.homedir(), ".hoox", "cache");
      const proc = Bun.spawn(["rm", "-rf", cachePath]);
      await proc.exited;
      useServiceStore.getState().addAlert({
        id: `cache-${Date.now()}`,
        type: "config",
        severity: "info",
        message: "Cache cleared successfully",
        timestamp: Date.now(),
        acknowledged: false,
      });
    } catch (err) {
      useServiceStore.getState().addAlert({
        id: `cache-err-${Date.now()}`,
        type: "config",
        severity: "error",
        message: `Cache clear failed: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    }
  }, [confirmAction]);

  const handleExportData = useCallback(async () => {
    try {
      const result = await cliBridge.configShow();
      if (!result.success) {
        useServiceStore.getState().addAlert({
          id: `export-err-${Date.now()}`,
          type: "config",
          severity: "error",
          message: `Export failed: ${result.stderr || result.stdout || "unknown error"}`,
          timestamp: Date.now(),
          acknowledged: false,
        });
        return;
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filePath = path.join(
        os.homedir(),
        ".hoox",
        `config-export-${timestamp}.json`
      );
      await Bun.write(filePath, JSON.stringify(result.data, null, 2));
      useServiceStore.getState().addAlert({
        id: `export-${Date.now()}`,
        type: "config",
        severity: "info",
        message: `Config exported to ${filePath}`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    } catch (err) {
      useServiceStore.getState().addAlert({
        id: `export-err-${Date.now()}`,
        type: "config",
        severity: "error",
        message: `Export error: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    }
  }, []);

  const handleImportData = useCallback(async () => {
    setImporting(true);
    setImportPath("");
  }, []);

  const handleImportConfirm = useCallback(async () => {
    if (!importPath.trim()) return;
    try {
      const f = Bun.file(importPath.trim());
      const exists = await f.exists();
      if (!exists) {
        useServiceStore.getState().addAlert({
          id: `import-err-${Date.now()}`,
          type: "config",
          severity: "error",
          message: `File not found: ${importPath.trim()}`,
          timestamp: Date.now(),
          acknowledged: false,
        });
        setImporting(false);
        return;
      }
      const text = await f.text();
      const config = JSON.parse(text);

      // Validate it has expected shape
      if (typeof config !== "object" || config === null) {
        throw new Error("Config must be a JSON object");
      }

      // Apply config values if they match known keys (light theme coerced to dark)
      if (typeof config.theme === "string")
        updateConfig({
          theme: config.theme === "light" ? "dark" : (config.theme as "dark"),
        });
      if (typeof config.refreshIntervalMs === "number")
        updateConfig({ refreshIntervalMs: config.refreshIntervalMs });
      if (typeof config.defaultView === "string")
        updateConfig({ defaultView: config.defaultView });
      if (typeof config.soundEnabled === "boolean")
        updateConfig({ soundEnabled: config.soundEnabled });
      if (
        typeof config.notifications === "object" &&
        config.notifications !== null
      ) {
        for (const key of Object.keys(config.notifications)) {
          if (typeof config.notifications[key] === "boolean") {
            toggleNotification(key as keyof NotificationPreferences);
          }
        }
      }
      if (config.activeExchanges)
        updateConfig({ activeExchanges: config.activeExchanges });

      useServiceStore.getState().addAlert({
        id: `import-${Date.now()}`,
        type: "config",
        severity: "info",
        message: `Config imported from ${importPath.trim()}`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    } catch (err) {
      useServiceStore.getState().addAlert({
        id: `import-err-${Date.now()}`,
        type: "config",
        severity: "error",
        message: `Import failed: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    }
    setImporting(false);
    setImportPath("");
  }, [importPath, updateConfig, toggleNotification]);

  const handleCheckSetup = useCallback(async () => {
    setSetupCheck({ kind: "running" });
    try {
      const result = await cliBridge.checkSetup();
      if (!result.success) {
        // Process-level failure (CLI exited non-zero, or binary not found).
        setSetupCheck({
          kind: "error",
          message: result.stderr || result.stdout || "unknown error from CLI",
        });
        useServiceStore.getState().addAlert({
          id: `setup-${Date.now()}`,
          type: "config",
          severity: "warning",
          message: `Setup check failed: ${result.stderr || result.stdout || "unknown error"}`,
          timestamp: Date.now(),
          acknowledged: false,
        });
        return;
      }
      // CLI succeeded — `data` should be a CheckReport JSON object.
      const data = result.data as Partial<CheckReport> | null;
      if (
        !data ||
        !Array.isArray(data.categories) ||
        typeof data.summary !== "object" ||
        data.summary === null
      ) {
        setSetupCheck({
          kind: "error",
          message:
            "CLI did not return a valid CheckReport (missing categories/summary).",
        });
        return;
      }
      // At this point we trust the shape — cast to CheckReport.
      const report: CheckReport = {
        success: Boolean(data.success),
        categories: data.categories as CheckCategoryResult[],
        summary: {
          total: Number(data.summary.total ?? 0),
          passed: Number(data.summary.passed ?? 0),
          failed: Number(data.summary.failed ?? 0),
          warnings: Number(data.summary.warnings ?? 0),
        },
      };
      setSetupCheck({
        kind: "report",
        report,
        durationMs: result.duration,
      });
      useServiceStore.getState().addAlert({
        id: `setup-${Date.now()}`,
        type: "config",
        severity: report.success ? "info" : "warning",
        message: report.success
          ? `Setup check passed (${(result.duration / 1000).toFixed(1)}s)`
          : `Setup check found ${report.summary.failed} issue(s)`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSetupCheck({ kind: "error", message });
      useServiceStore.getState().addAlert({
        id: `setup-err-${Date.now()}`,
        type: "config",
        severity: "error",
        message: `Setup check error: ${message}`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    }
  }, []);

  /** Dismiss the Check Setup results panel. */
  const dismissCheckSetup = useCallback(() => {
    setSetupCheck({ kind: "idle" });
  }, []);

  /** Run auto-repair via `hoox check fix`. */
  const handleRunAutoRepair = useCallback(async () => {
    const ok = await confirmAction(
      "Run Auto-Repair?",
      "Apply non-destructive config fixes (placeholders, flags, worker configs). Continue?",
      "Run Repair"
    );
    if (!ok) return;
    try {
      const result = await cliBridge.checkFix();
      if (!result.success) {
        useServiceStore.getState().addAlert({
          id: `auto-repair-${Date.now()}`,
          type: "config",
          severity: "warning",
          message: `Auto-repair failed: ${result.stderr || result.stdout || "unknown error"}`,
          timestamp: Date.now(),
          acknowledged: false,
        });
        return;
      }

      // Parse FixReport
      const data = result.data as {
        actions?: Array<{
          description: string;
          type: string;
          target: string;
          applied: boolean;
          error?: string;
        }>;
        summary?: {
          total: number;
          applied: number;
          skipped: number;
          failed: number;
        };
      } | null;

      if (!data || !Array.isArray(data.actions)) {
        useServiceStore.getState().addAlert({
          id: `auto-repair-${Date.now()}`,
          type: "config",
          severity: "warning",
          message: "Auto-repair returned invalid result",
          timestamp: Date.now(),
          acknowledged: false,
        });
        return;
      }

      const applied = data.actions.filter((a) => a.applied).length;
      const failed = data.actions.filter((a) => a.error).length;
      useServiceStore.getState().addAlert({
        id: `auto-repair-${Date.now()}`,
        type: "config",
        severity: failed > 0 ? "warning" : "info",
        message:
          failed > 0
            ? `Auto-repair: ${applied} applied, ${failed} failed`
            : `Auto-repair: ${applied} fix(es) applied`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      useServiceStore.getState().addAlert({
        id: `auto-repair-err-${Date.now()}`,
        type: "config",
        severity: "error",
        message: `Auto-repair error: ${message}`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    }
  }, [confirmAction]);

  const handleResetDefaults = useCallback(async () => {
    const ok = await confirmAction(
      "Reset Defaults?",
      "Reset theme, refresh rate, default view, and notification preferences to factory defaults?",
      "Reset"
    );
    if (!ok) return;
    resetDefaults();
    useServiceStore.getState().addAlert({
      id: `reset-${Date.now()}`,
      type: "config",
      severity: "info",
      message: "Settings reset to defaults",
      timestamp: Date.now(),
      acknowledged: false,
    });
  }, [confirmAction, resetDefaults]);

  /**
   * Test hook: when `globalThis.__hooxTestAutoCheckSetup` is set, the
   * Check Setup check runs automatically once on mount. This lets the
   * test suite populate the results panel without simulating mouse/keyboard
   * events. Production code never sets this flag.
   */
  useEffect(() => {
    const g = globalThis as unknown as {
      __hooxTestAutoCheckSetup?: boolean;
    };
    if (g.__hooxTestAutoCheckSetup) {
      void handleCheckSetup();
    }
    // Intentionally mount-only — tests set the flag then render, so
    // re-running on state changes would cause duplicate checks.
  }, []);

  /** Max items per panel */
  const maxItemsPerPanel = useMemo((): Record<number, number> => {
    return {
      0: THEME_ITEM_COUNT,
      1: NOTIF_ITEM_COUNT,
      2: 1, // Keyboard panel has no interactive items (read-only)
      3: DATA_ITEM_COUNT,
    };
  }, []);

  // ── Keyboard handling (only when Settings is the active view) ───────────────

  useKeyboard((key) => {
    if (!isActive) return;
    // Import mode overrides
    if (importing) {
      if (key.name === "return" || key.name === "enter") {
        handleImportConfirm();
        return;
      }
      if (key.name === "escape") {
        setImporting(false);
        setImportPath("");
        return;
      }
      return; // block other keys during import
    }

    // Check Setup results panel: ESC dismisses (overrides panel navigation)
    if (setupCheck.kind !== "idle" && key.name === "escape") {
      dismissCheckSetup();
      return;
    }

    // Tab: cycle panels
    if (key.name === "tab") {
      setActivePanel((p) => (p + 1) % PANEL_COUNT);
      setActiveItem(0);
      return;
    }

    // Up/Down: navigate items within active panel
    if (key.name === "up") {
      setActiveItem((i) => Math.max(0, i - 1));
      return;
    }
    if (key.name === "down") {
      setActiveItem((i) =>
        Math.min((maxItemsPerPanel[activePanel] ?? 0) - 1, i + 1)
      );
      return;
    }

    // Panel-specific actions
    switch (activePanel) {
      case 0: {
        // Theme panel — items: 0 refresh, 1 default view, 2 reset
        switch (activeItem) {
          case 0: {
            // Refresh rate
            const currentIdx = REFRESH_RATES.indexOf(
              refreshIntervalMs as (typeof REFRESH_RATES)[number]
            );
            if (key.name === "left") {
              const prev =
                (currentIdx - 1 + REFRESH_RATES.length) % REFRESH_RATES.length;
              updateConfig({ refreshIntervalMs: REFRESH_RATES[prev] });
            } else if (key.name === "right") {
              const next = (currentIdx + 1) % REFRESH_RATES.length;
              updateConfig({ refreshIntervalMs: REFRESH_RATES[next] });
            }
            break;
          }
          case 1: {
            // Default view
            const currentIdx = VIEW_OPTIONS.indexOf(defaultView);
            if (key.name === "left") {
              const prev =
                (currentIdx - 1 + VIEW_OPTIONS.length) % VIEW_OPTIONS.length;
              updateConfig({ defaultView: VIEW_OPTIONS[prev] });
            } else if (key.name === "right") {
              const next = (currentIdx + 1) % VIEW_OPTIONS.length;
              updateConfig({ defaultView: VIEW_OPTIONS[next] });
            }
            break;
          }
          case 2: // Reset defaults
            if (key.name === "space" || key.name === "return")
              void handleResetDefaults();
            break;
        }
        break;
      }

      case 1: {
        // Notifications panel
        if (activeItem >= 0 && activeItem < 4) {
          if (key.name === "space") {
            const channel = NOTIFICATION_CHANNELS[activeItem];
            toggleNotification(channel);
          }
        } else if (activeItem === 4) {
          if (key.name === "space")
            updateConfig({ soundEnabled: !soundEnabled });
        }
        break;
      }

      case 2: {
        // Keyboard panel — read-only, nothing to toggle
        break;
      }

      case 3: {
        // Data panel — buttons are activated on Enter/Space
        if (key.name === "space" || key.name === "return") {
          switch (activeItem) {
            case 0:
              handleClearCache();
              break;
            case 1:
              handleExportData();
              break;
            case 2:
              handleImportData();
              break;
            case 3:
              handleCheckSetup();
              break;
            case 4:
              handleRunAutoRepair();
              break;
          }
        }
        break;
      }
    }
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <ErrorBoundary viewName="Settings">
      <box flexDirection="column" flexGrow={1} padding={1} gap={1}>
        <ViewHeader
          title="SETTINGS"
          meta={
            <text fg={Colors.muted} dim>
              Tab to switch panels · ↑↓ to navigate · ←→ to change · Space to
              toggle
            </text>
          }
        />

        {/* 4-column layout */}
        <box flexDirection="row" flexGrow={1} gap={1}>
          <Panel
            title="THEME"
            focused={activePanel === 0}
            width={28}
            flexGrow={1}
            compact
          >
            <ThemePanel
              active={activePanel === 0}
              activeItem={activeItem}
              onResetDefaults={() => void handleResetDefaults()}
            />
          </Panel>

          <Panel
            title="NOTIFICATIONS"
            focused={activePanel === 1}
            width={28}
            flexGrow={1}
            compact
          >
            <NotificationsPanel
              active={activePanel === 1}
              activeItem={activeItem}
            />
          </Panel>

          <Panel
            title="KEYBOARD"
            focused={activePanel === 2}
            width={34}
            flexGrow={1}
            compact
          >
            <KeyboardPanel />
          </Panel>

          <Panel
            title="DATA"
            focused={activePanel === 3}
            width={24}
            flexGrow={1}
            compact
          >
            <DataPanel
              active={activePanel === 3}
              activeItem={activeItem}
              onClearCache={handleClearCache}
              onExportData={handleExportData}
              onImportData={handleImportData}
              onCheckSetup={handleCheckSetup}
              onRunAutoRepair={handleRunAutoRepair}
            />
          </Panel>
        </box>

        {/* Check Setup results panel — persists until dismissed or view change */}
        {setupCheck.kind !== "idle" && (
          <CheckSetupResultsPanel
            state={setupCheck}
            onDismiss={dismissCheckSetup}
            onRerun={handleCheckSetup}
          />
        )}

        {/* Import path input overlay */}
        {importing && (
          <box
            flexDirection="row"
            gap={1}
            paddingTop={1}
            paddingLeft={1}
            paddingRight={1}
            backgroundColor={Colors.card}
          >
            <text fg={Colors.accent} bold>
              Import path:
            </text>
            <input
              id="import-path"
              placeholder="~/.hoox/config.json"
              width={40}
              textColor={Colors.foreground}
              cursorColor={Colors.accent}
              onInput={(v: string) => setImportPath(v)}
              value={importPath}
            />
            <text
              fg={importPath.trim() ? Colors.accent : Colors.muted}
              bold={!!importPath.trim()}
              onMouseUp={importPath.trim() ? handleImportConfirm : undefined}
            >
              [Import]
            </text>
            <text fg={Colors.muted} onMouseUp={() => setImporting(false)}>
              [Cancel]
            </text>
          </box>
        )}
      </box>
    </ErrorBoundary>
  );
}
