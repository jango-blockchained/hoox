/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * App Root — Main entry point for the Hoox TUI dashboard.
 *
 * Responsibilities:
 *   1. Restore session state from $HOME/.hoox/.tui-state/session.json on startup
 *   2. Initialize ToasterRenderable for toast notifications
 *   3. Render the layout shell (sidebar, tab bar, status bar, active view)
 *   4. Register global keyboard shortcuts
 *   5. Catch unhandled errors → crash screen
 *   6. Save session state on clean shutdown
 *
 * Follows TUI Pattern 1 (FrameBuffer full-screen root) and Pattern 4 (Keyboard).
 * Colors from design tokens via @hoox-sh/hoox-shared. No CSS, no DOM.
 */
import { useState, useEffect, useCallback } from "react";
import { useKeyboard } from "@opentui/react";
import { DialogProvider, useDialog } from "@opentui-ui/dialog/react";
import { useServiceStore, useUIStore, Colors } from "@hoox-sh/hoox-shared";
import { restoreSession, saveSession } from "@hoox-sh/hoox-shared";
import type { SessionState } from "@hoox-sh/hoox-shared";
import type { ViewId } from "@hoox-sh/hoox-shared";

import { cliBridge } from "./services/cli-bridge";
import { resolveTuiStatePath } from "./services/hoox-path-service";
import { tuiDevLog } from "./services/dev-log";
import {
  classifyConnectionError,
  resolveTuiConnectionEnv,
} from "./services/tui-connection";
import {
  toastAuthMissingRemote,
  toastAuthRequiredMode,
  toastConnectedMode,
  toastConnectionLostMode,
  toastOfflineStartup,
  toastRateLimited,
  toastReconnectedMode,
} from "./components/ui/connection-toasts";
import { getRendererRef } from "./hooks";
import type { DialogHandle } from "./components/ui/dialog";
import {
  getViewFactory,
  getViewShortcutMap,
  getCtrlAltViewMap,
  ALL_PALETTE_COMMANDS,
} from "./view-registry";
import {
  CrashScreen,
  type CrashAction,
} from "./components/shared/crash-screen";
import { CommandPalette } from "./components/shared/command-palette";
import { QuitModal } from "./components/shared/quit-modal";
import { StatusBar } from "./components/layout/statusbar";
import { Sidebar } from "./components/layout/sidebar";

// ─── View keyboard shortcuts (derived from view-registry) ────────────────────

const VIEW_SHORTCUTS = getViewShortcutMap();
const CTRL_ALT_VIEWS = getCtrlAltViewMap();

// ─── Main App ────────────────────────────────────────────────────────────────

/**
 * AppRoot — the top-level component.
 *
 * Renders the full layout: Sidebar | (TabBar + View) with StatusBar at bottom.
 * Wraps the entire app in a try/catch-free zone; unhandled errors are caught
 * by the platform-level crash handler (registered in the entry script).
 *
 * State flow:
 *   1. On mount: restore session → set activeView and sidebarExpanded
 *   2. On unmount (cleanup): save session to $HOME/.hoox/.tui-state/session.json
 *   3. Crash: CrashScreen rendered with [Restart] [Safe Mode] [Report Bug]
 */
/** Cleanly shut down the TUI: destroy renderer (session save runs on destroy) then exit. */
function quitApp(): void {
  try {
    const renderer = getRendererRef();
    renderer?.destroy();
  } catch {
    // destroy may throw if already torn down
  }
  process.exit(0);
}

/**
 * AppRoot — wraps the shell in DialogProvider so views can call
 * `showConfirm` / `useDialog` for destructive actions.
 */
export function AppRoot({ safeMode = false }: { safeMode?: boolean }) {
  return (
    <DialogProvider
      size="medium"
      backdropColor={Colors.backdrop}
      backdropOpacity={0.35}
    >
      <AppRootInner safeMode={safeMode} />
    </DialogProvider>
  );
}

function AppRootInner({ safeMode: _safeMode = false }: { safeMode?: boolean }) {
  // DialogProvider is required for useDialog; cast to our thin DialogHandle.
  const dialog = useDialog() as unknown as DialogHandle;
  const [restoring, setRestoring] = useState(true);
  const activeView = useUIStore((s) => s.activeView);
  const sidebarExpanded = useUIStore((s) => s.sidebarExpanded);
  const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen);
  const modal = useUIStore((s) => s.modal);
  const setView = useUIStore((s) => s.setView);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const openPalette = useUIStore((s) => s.openPalette);
  const closePalette = useUIStore((s) => s.closePalette);
  const showModal = useUIStore((s) => s.showModal);
  const dismissModal = useUIStore((s) => s.dismissModal);

  const requestQuit = useCallback(() => {
    closePalette();
    showModal({
      type: "confirm",
      title: "Quit HOOX?",
      message: "Exit the terminal operations center.",
      onConfirm: quitApp,
      onCancel: () => dismissModal(),
    });
  }, [closePalette, showModal, dismissModal]);

  // ── Session restore on mount ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    restoreSession().then((session: SessionState) => {
      if (cancelled) return;
      // Restore previous view if valid
      if (session.activeView) {
        setView(session.activeView);
      }
      // Restore sidebar state
      if (!session.sidebarExpanded && sidebarExpanded) {
        toggleSidebar();
      }
      setRestoring(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Startup data load: HTTP → (local only) CLI fallback ────────────────
  // After session restore, try to fetch worker data. HTTP is tried first;
  // if the local dev server is unreachable, fall back to the `hoox` CLI.
  // REMOTE mode never uses CLI fallback — gateway HTTP is the source of truth.
  // Also kick off SSE trade/log streams when the API is available.
  useEffect(() => {
    if (restoring) return;
    let cancelled = false;

    (async () => {
      const store = useServiceStore.getState();
      const conn = resolveTuiConnectionEnv();
      await tuiDevLog.info("connection", "startup data load begin", {
        mode: conn.mode,
        apiUrl: conn.apiUrl,
        hasToken: conn.hasToken,
        allowCliFallback: conn.allowCliFallback,
      });

      if (conn.mode === "remote" && !conn.hasToken) {
        toastAuthMissingRemote(conn.apiHost);
        await tuiDevLog.warn("connection", "remote without API token", {
          host: conn.apiHost,
        });
      }

      // fetchWorkers swallows network errors into store state — inspect status.
      await store.fetchWorkers();
      if (cancelled) return;
      const afterHttp = useServiceStore.getState();
      const httpOk = afterHttp.connectionStatus === "connected";
      if (httpOk) {
        toastConnectedMode(conn.mode, conn.apiHost);
        await tuiDevLog.info("connection", "HTTP fetchWorkers succeeded", {
          mode: conn.mode,
          apiUrl: conn.apiUrl,
          workerCount: afterHttp.workers.length,
        });
      } else {
        const kind = classifyConnectionError(afterHttp.lastError);
        if (kind === "auth") {
          toastAuthRequiredMode(conn.mode, conn.apiHost);
        } else if (kind === "rate-limit") {
          toastRateLimited();
        } else {
          toastOfflineStartup(conn.mode, conn.apiHost, kind);
        }
        await tuiDevLog.warn("connection", "HTTP fetchWorkers failed", {
          mode: conn.mode,
          apiUrl: conn.apiUrl,
          connectionStatus: afterHttp.connectionStatus,
          lastError: afterHttp.lastError,
          errorKind: kind,
        });
      }

      // CLI fallback: local only (never mark REMOTE connected via local CLI)
      if (!httpOk && conn.allowCliFallback) {
        try {
          await tuiDevLog.debug("connection", "CLI monitorStatus fallback");
          const result = await cliBridge.monitorStatus();
          if (cancelled) return;
          if (result.success && result.data) {
            const raw = result.data as Record<string, unknown>;
            const rawWorkers = (raw.workers ?? raw.status ?? raw) as
              | unknown[]
              | Record<string, unknown>;
            const parsed = Array.isArray(rawWorkers)
              ? rawWorkers
              : typeof rawWorkers === "object" && rawWorkers !== null
                ? Object.values(rawWorkers)
                : [];
            if (parsed.length > 0) {
              const workerInfo = (parsed as Record<string, unknown>[]).map(
                (w, i) => {
                  const cliStatus = String(w.status ?? "healthy");
                  const status =
                    cliStatus === "healthy"
                      ? "operational"
                      : cliStatus === "degraded"
                        ? "degraded"
                        : "down";
                  return {
                    id: String(w.id ?? w.worker ?? `worker-${i}`),
                    name: String(w.worker ?? `worker-${i}`),
                    status: status as "operational" | "degraded" | "down",
                    uptime: Number(w.uptime ?? 0) || 0,
                    cpu: Number(w.cpu ?? 0) || 0,
                    memory: Number(w.memory ?? 0) || 0,
                    requests: Number(w.requests ?? 0) || 0,
                    durableObjectCount: Number(w.durableObjectCount ?? 0) || 0,
                    edgeCount: Number(w.edgeCount ?? 0) || 0,
                    version: String(w.version ?? ""),
                    lastDeployed: Number(w.lastDeployed ?? 0) || 0,
                  };
                }
              );
              store.setWorkers(workerInfo);
              store.setMetrics({
                totalWorkers: workerInfo.length,
                onlineWorkers: workerInfo.filter(
                  (x) => x.status === "operational"
                ).length,
                totalPnl: 0,
                activeStrategies: 0,
                dailyTrades: 0,
                aiCalls: 0,
                uptime: 0,
                lastUpdated: Date.now(),
              });
              store.handleConnectionSuccess();
              toastConnectedMode(conn.mode, conn.apiHost);
              await tuiDevLog.info("connection", "CLI fallback succeeded", {
                workerCount: workerInfo.length,
              });
            } else {
              await tuiDevLog.warn(
                "connection",
                "CLI fallback returned no workers",
                {
                  success: result.success,
                  stderr: result.stderr || null,
                }
              );
            }
          } else {
            await tuiDevLog.warn("connection", "CLI fallback failed", {
              success: result.success,
              stderr: result.stderr || null,
              errorType: result.errorType ?? null,
            });
          }
        } catch (err) {
          await tuiDevLog.error(
            "connection",
            "HTTP and CLI unavailable — staying offline",
            {
              error: err instanceof Error ? err.message : String(err),
            }
          );
        }
      } else if (!httpOk && !conn.allowCliFallback) {
        await tuiDevLog.info(
          "connection",
          "skipping CLI fallback in remote mode"
        );
      }

      if (cancelled) return;

      // Long-lived SSE streams (no-op when API offline; store handles errors)
      await tuiDevLog.debug("connection", "starting SSE trade/log streams");
      void store.streamTrades();
      void store.streamLogs();
    })();

    return () => {
      cancelled = true;
    };
  }, [restoring]);

  // ── Connection status → mode-aware toasts ───────────────────────────────
  useEffect(() => {
    if (restoring) return;
    const conn = resolveTuiConnectionEnv();
    let prev = useServiceStore.getState().connectionStatus;
    let prevDisconnectedAt = useServiceStore.getState().disconnectedAt;

    const unsub = useServiceStore.subscribe((state) => {
      const next = state.connectionStatus;
      if (next === prev) return;

      if (
        next === "connected" &&
        (prev === "reconnecting" || prev === "offline" || prev === "polling")
      ) {
        if (prevDisconnectedAt != null && prevDisconnectedAt > 0) {
          toastReconnectedMode(conn.mode, conn.apiHost, prevDisconnectedAt);
        }
      } else if (next === "offline" && prev !== "offline") {
        const kind = classifyConnectionError(state.lastError);
        if (kind === "auth") {
          toastAuthRequiredMode(conn.mode, conn.apiHost);
        } else if (kind === "rate-limit") {
          toastRateLimited();
        } else {
          toastConnectionLostMode(conn.mode, conn.apiHost);
        }
      }

      prev = next;
      prevDisconnectedAt = state.disconnectedAt;
    });

    return unsub;
  }, [restoring]);

  // ── Session save on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const lastUpdated = useServiceStore.getState().lastUpdated;
      saveSession(
        useUIStore.getState().activeView,
        useUIStore.getState().sidebarExpanded,
        { cols: 80, rows: 24 }, // window size detected elsewhere
        lastUpdated
      ).catch(() => {
        // Non-fatal: session save failures are logged silently
      });
    };
  }, []);

  // ── Global CLI bridge error sink ────────────────────────────────────────
  // Registers a single error sink at the app root so every `cliBridge.*`
  // call (deploy, kill-switch, health check, etc.) — regardless of which
  // view triggered it — propagates structured `CliErrorDetails` to the
  // service store. The status bar subscribes to `lastErrorDetails` and
  // surfaces the real diagnostic context (command, exit code, stderr)
  // instead of a generic OFFLINE pill.
  useEffect(() => {
    const unsubscribe = cliBridge.onError((details) => {
      useServiceStore.getState().setLastErrorDetails(details);
    });
    return unsubscribe;
  }, []);

  // ── Global keyboard shortcuts ───────────────────────────────────────────
  useKeyboard((key) => {
    // Quit confirmation modal takes priority over other shortcuts
    if (modal?.type === "confirm" && modal.title === "Quit HOOX?") {
      const name = String(key.name ?? "").toLowerCase();
      if (name === "return" || name === "enter" || name === "y") {
        dismissModal();
        quitApp();
        return;
      }
      if (name === "escape" || name === "n") {
        dismissModal();
        return;
      }
      return; // swallow other keys while confirming quit
    }

    // Ctrl+1-9 / Ctrl+0: switch views (not while alt is held)
    if (key.ctrl && !key.alt && VIEW_SHORTCUTS[key.name]) {
      setView(VIEW_SHORTCUTS[key.name]);
      return;
    }

    // Ctrl+Alt+letter: switch to letter-chord views (kv, secrets, etc.)
    if (key.ctrl && key.alt && CTRL_ALT_VIEWS[key.name]) {
      setView(CTRL_ALT_VIEWS[key.name]);
      return;
    }

    // Ctrl+B: toggle sidebar
    if (key.ctrl && !key.alt && key.name === "b") {
      toggleSidebar();
      return;
    }

    // Ctrl+P: command palette
    if (key.ctrl && !key.alt && key.name === "p") {
      openPalette();
      return;
    }

    // Ctrl+R: refresh worker data
    if (key.ctrl && !key.alt && key.name === "r") {
      void useServiceStore.getState().fetchWorkers();
      return;
    }

    // Ctrl+Q: quit with confirmation (Ctrl+Alt+Q is db-query above)
    if (key.ctrl && !key.alt && key.name === "q") {
      requestQuit();
      return;
    }

    // Escape: dismiss modal, then palette
    if (key.name === "escape") {
      if (modal) {
        dismissModal();
        return;
      }
      closePalette();
      return;
    }
  });

  // ── Loading state during session restore ────────────────────────────────
  if (restoring) {
    return (
      <box
        flexDirection="column"
        width="100%"
        height="100%"
        justifyContent="center"
        alignItems="center"
        backgroundColor={Colors.background}
      >
        <text fg={Colors.highlight} bold>
          ┌ HOOX ┐
        </text>
        <text fg={Colors.muted} dim>
          Restoring session…
        </text>
      </box>
    );
  }

  // ── Active view component ───────────────────────────────────────────────
  const renderView = getViewFactory(activeView);

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor={Colors.background}
    >
      {/* Main area: Sidebar + Content */}
      <box flexDirection="row" flexGrow={1}>
        {/* Sidebar (left) */}
        <Sidebar />

        {/* Content area: View (fills remaining space) */}
        <box flexDirection="column" flexGrow={1} padding={1}>
          {renderView(dialog)}
        </box>
      </box>

      {/* StatusBar (bottom, always visible) */}
      <StatusBar />

      {/* Command Palette overlay */}
      {commandPaletteOpen && (
        <CommandPalette
          visible={commandPaletteOpen}
          commands={ALL_PALETTE_COMMANDS}
          onSelect={(selection) => {
            if (selection.action === "setView" && selection.command.id) {
              setView(selection.command.id as ViewId);
            } else if (selection.command.id === "refresh") {
              void useServiceStore.getState().fetchWorkers();
            } else if (selection.command.id === "toggle-sidebar") {
              toggleSidebar();
            } else if (selection.command.id === "quit") {
              closePalette();
              requestQuit();
              return;
            }
            closePalette();
          }}
          onDismiss={() => closePalette()}
        />
      )}

      {/* Quit confirmation overlay */}
      {modal?.type === "confirm" && modal.title === "Quit HOOX?" && (
        <QuitModal
          title={modal.title}
          message={modal.message ?? "Exit the terminal operations center."}
          onConfirm={() => {
            dismissModal();
            quitApp();
          }}
          onCancel={() => dismissModal()}
        />
      )}
    </box>
  );
}

// ─── Crash Recovery Wrapper ──────────────────────────────────────────────────

/**
 * CrashRecoveryApp — wraps AppRoot with a crash boundary.
 *
 * When an unhandled error escapes the React tree:
 *   1. The error is caught
 *   2. CrashScreen is rendered with action buttons
 *   3. [Restart] → re-mount AppRoot (clears React error state)
 *   4. [Safe Mode] → re-mount with crashScreen.safeMode=true
 *   5. [Report Bug] → write error details to $HOME/.hoox/.tui-state/crash.log
 */
export function CrashRecoveryApp() {
  const [crash, setCrash] = useState<Error | null>(null);
  const [safeMode, setSafeMode] = useState(false);

  // React error boundary equivalent: catch errors in a wrapper
  const handleCrashAction = useCallback(
    (action: CrashAction) => {
      switch (action) {
        case "restart":
          // Clear crash state → re-mount AppRoot
          setCrash(null);
          setSafeMode(false);
          break;

        case "safe-mode":
          // Clear crash, enable safe mode
          setCrash(null);
          setSafeMode(true);
          break;

        case "report-bug":
          // Write crash details to $HOME/.hoox/.tui-state/crash.log
          if (crash) {
            const crashLog = [
              `=== Hoox Crash Report ===`,
              `Time: ${new Date().toISOString()}`,
              `Error: ${crash.message}`,
              `Stack: ${crash.stack ?? "N/A"}`,
              `Safe Mode: ${safeMode}`,
              ``,
            ].join("\n");
            // Best-effort write (non-blocking) to $HOME/.hoox/.tui-state/crash.log
            try {
              Bun.write(resolveTuiStatePath("crash.log"), crashLog).catch(
                () => {}
              );
            } catch {
              // Silent — write failed
            }
          }
          break;
      }
    },
    [crash, safeMode]
  );

  // Register unhandled error handler (Bun/Node global handlers)
  useEffect(() => {
    if (typeof process !== "undefined") {
      process.on("uncaughtException", (error: Error) => {
        setCrash(error);
      });
      process.on("unhandledRejection", (reason: unknown) => {
        setCrash(reason instanceof Error ? reason : new Error(String(reason)));
      });
    }

    return () => {
      if (typeof process !== "undefined") {
        process.removeAllListeners("uncaughtException");
        process.removeAllListeners("unhandledRejection");
      }
    };
  }, []);

  // ── Crash screen ────────────────────────────────────────────────────────
  if (crash) {
    return (
      <CrashScreen
        error={crash}
        safeMode={safeMode}
        onAction={handleCrashAction}
      />
    );
  }

  // ── Normal / safe mode ──────────────────────────────────────────────────
  return <AppRoot safeMode={safeMode} />;
}
