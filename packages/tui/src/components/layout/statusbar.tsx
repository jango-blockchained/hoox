/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * StatusBar — bottom bar showing connection status, stale data indicator,
 * last-updated timestamp, and (on failure) a click-to-expand error panel.
 *
 * Behaviour:
 *   - One-line summary always visible: `[OFFLINE] | <short message>`
 *   - Click the OFFLINE / RECONNECTING pill to toggle the full error panel
 *     below the bar, showing command, exit code, stderr, stdout, and a
 *     recovery hint.
 *   - Panel text is `selectable: true` so the user can copy the full
 *     diagnostics with the terminal mouse selection. A visible hint at
 *     the bottom of the panel surfaces this affordance.
 *   - A contextual recovery hint (e.g. "Run `bun install`") appears for
 *     known error types so the user gets a suggested next step, not just
 *     the raw error.
 */
import { useState, useCallback, memo } from "react";
import {
  Colors,
  ConnectionStatusColor,
  useServiceStore,
  formatRelativeTimeFromTime as formatRelativeTime,
  type CliErrorType,
  type CliErrorDetails,
} from "@jango-blockchained/hoox-shared";
import {
  classifyConnectionError,
  hasApiToken,
  resolveTuiConnectionEnv,
} from "../../services/tui-connection";
import { CoolGlyph } from "../shared/cool-brackets";

/** Map each CliErrorType to a short, human-readable label. */
const ERROR_TYPE_LABELS: Record<CliErrorType, string> = {
  "binary-not-found": "CLI binary not found",
  timeout: "Command timed out",
  aborted: "Command aborted",
  "non-zero-exit": "Command failed",
  "spawn-error": "Failed to start CLI",
};

/**
 * Per-error-type recovery hint shown just below the error type. Keeps
 * the user from staring at "non-zero-exit" with no idea what to do.
 */
const RECOVERY_HINTS: Record<CliErrorType, string> = {
  "binary-not-found":
    "Install the CLI (`bun install -g ./packages/cli`) or set HOOX_CLI=/path/to/hoox.",
  timeout: "The command exceeded its timeout. Retry or raise the limit.",
  aborted: "The command was cancelled. Retry to run it again.",
  "non-zero-exit": "Inspect stderr below for the underlying cause, then retry.",
  "spawn-error":
    "Bun.spawn failed (permission or path issue). Check HOOX_CLI / PATH (hx, hoox).",
};

/** Host label for the status bar (no scheme; falls back to raw URL). */
export function resolveApiHostLabel(apiUrl: string): string {
  try {
    return new URL(apiUrl).host || apiUrl;
  } catch {
    return apiUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "") || apiUrl;
  }
}

/** Count non-empty lines in a string for the section header badge. */
function countLines(text: string): number {
  if (!text) return 0;
  return text.split("\n").filter((line) => line.length > 0).length;
}

/** Format a timestamp as a compact "HH:MM:SS" string. */
function formatClockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ─── Expanded Error Panel ─────────────────────────────────────────────────────

interface ExpandedErrorPanelProps {
  details: CliErrorDetails;
}

/**
 * ExpandedErrorPanel — full diagnostic context for a CLI bridge failure.
 * Extracted to keep the parent `StatusBar` small and to make this view
 * independently testable.
 *
 * Exported for direct unit testing — production code should consume it
 * via {@link StatusBar} (which manages the expansion state).
 */
export const ExpandedErrorPanel = memo(function ExpandedErrorPanel({
  details,
}: ExpandedErrorPanelProps) {
  const stderrLines = countLines(details.stderr);
  const stdoutLines = countLines(details.stdout);
  const showStdout =
    details.stdout.length > 0 && details.stdout !== details.stderr;

  return (
    <box
      flexDirection="column"
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      backgroundColor={Colors.card}
    >
      {/* Header — classification + recovery hint */}
      <box flexDirection="column">
        <text fg={Colors.error} bold>
          ✗ {ERROR_TYPE_LABELS[details.errorType]}{" "}
          <span fg={Colors["muted-foreground"]}>({details.errorType})</span>
        </text>
        <text fg={Colors["muted-foreground"]}>
          {RECOVERY_HINTS[details.errorType]}
        </text>
      </box>

      {/* Spacer */}
      <text> </text>

      {/* Command — own line so a long path doesn't crowd the metadata row */}
      <box flexDirection="column">
        <text fg={Colors.muted}>Command</text>
        {/* Selectable: user can copy the exact command for reproduction. */}
        <text fg={Colors.foreground} selectable>
          {details.command || "(unknown — binary not found)"}
        </text>
      </box>

      {/* Metadata row — exit code, duration, timestamp */}
      <box flexDirection="row" gap={1}>
        <text fg={Colors.muted}>Exit code:</text>
        <text fg={details.exitCode === 0 ? Colors.success : Colors.warning}>
          {details.exitCode}
        </text>
        <text fg={Colors.muted}>·</text>
        <text fg={Colors.muted}>Duration:</text>
        <text fg={Colors.foreground}>{details.duration.toFixed(0)}ms</text>
        <text fg={Colors.muted}>·</text>
        <text fg={Colors.muted}>Time:</text>
        <text fg={Colors.foreground}>{formatClockTime(details.timestamp)}</text>
      </box>

      {/* stderr — line count badge, then selectable text */}
      {details.stderr && (
        <box flexDirection="column">
          <text fg={Colors.muted}>
            stderr ({stderrLines} {stderrLines === 1 ? "line" : "lines"})
          </text>
          <text fg={Colors.foreground} selectable>
            {details.stderr}
          </text>
        </box>
      )}

      {/* stdout — only show if distinct from stderr */}
      {showStdout && (
        <box flexDirection="column">
          <text fg={Colors.muted}>
            stdout ({stdoutLines} {stdoutLines === 1 ? "line" : "lines"})
          </text>
          <text fg={Colors.foreground} selectable>
            {details.stdout}
          </text>
        </box>
      )}

      {/* Footer — copy affordance + dismiss hint */}
      <text fg={Colors["muted-foreground"]}>
        Drag-select text to auto-copy · click header to collapse
      </text>
    </box>
  );
});

// ─── One-line Summary ─────────────────────────────────────────────────────────

interface SummaryLineProps {
  statusColor: string;
  pillInteractive: boolean;
  onClick: () => void;
  expandHint: string;
  children: string;
}

const SummaryLine = memo(function SummaryLine({
  statusColor,
  pillInteractive,
  onClick,
  expandHint,
  children,
}: SummaryLineProps) {
  if (pillInteractive) {
    return (
      <text fg={statusColor} onMouseUp={onClick}>
        {children}
        {expandHint ? `  ${expandHint}` : ""}
      </text>
    );
  }
  return <text fg={statusColor}>{children}</text>;
});

// ─── StatusBar ────────────────────────────────────────────────────────────────

export function StatusBar() {
  const connectionStatus = useServiceStore((s) => s.connectionStatus);
  const lastUpdated = useServiceStore((s) => s.lastUpdated);
  const lastError = useServiceStore((s) => s.lastError);
  const lastErrorDetails = useServiceStore((s) => s.lastErrorDetails);
  const retryCount = useServiceStore((s) => s.retryCount);
  const reconnectDelay = useServiceStore((s) => s.reconnectDelay);

  const conn = resolveTuiConnectionEnv();
  const tuiMode = conn.mode;
  const apiHost = conn.apiHost;
  const tokenPresent = hasApiToken();
  const errorKind = classifyConnectionError(lastError);
  // Compact AUTH cue: missing token (remote) or auth error — keep short for host room
  const showAuthHint =
    tuiMode === "remote" &&
    (!tokenPresent ||
      errorKind === "auth" ||
      Boolean(lastError?.includes("401")));

  // Local UI state — expansion is purely a presentation concern, so it
  // lives in component state rather than the global store.
  const [errorExpanded, setErrorExpanded] = useState<boolean>(false);

  const toggleError = useCallback(() => {
    setErrorExpanded((prev) => !prev);
  }, []);

  const statusLabel: Record<string, string> = {
    connected: "CONNECTED",
    polling: "POLLING",
    reconnecting: "RECONNECTING",
    offline: "OFFLINE",
  };

  const relativeTime = lastUpdated > 0 ? formatRelativeTime(lastUpdated) : "—";

  // The status pill is clickable when there are error details to show —
  // this is the affordance for the "click OFFLINE to expand" requirement.
  const hasDetails = lastErrorDetails !== null;
  const isErrorState =
    connectionStatus === "offline" || connectionStatus === "reconnecting";
  const pillInteractive = hasDetails && isErrorState;

  const modeColor =
    tuiMode === "remote" ? Colors.info : Colors["muted-foreground"];
  const modeLabel = tuiMode === "remote" ? "REMOTE" : "LOCAL";

  const parts: string[] = [
    `[${statusLabel[connectionStatus] ?? connectionStatus.toUpperCase()}]`,
  ];

  if (connectionStatus === "reconnecting") {
    parts.push(`retry ${retryCount}/5 (${reconnectDelay}ms)`);
  }

  parts.push(
    isErrorState ? `Last updated: ${relativeTime}` : `Updated: ${relativeTime}`
  );

  if (showAuthHint) {
    parts.push(!tokenPresent ? "| AUTH?" : "| AUTH!");
  }

  if (lastError && isErrorState && errorKind !== "auth") {
    // Full short message (expand panel for diagnostics). Auth errors use AUTH! above.
    parts.push(`| ${lastError}`);
  }

  // The expand hint appears whenever a clickable error is available so
  // users know they can drill in.
  const expandHint = pillInteractive
    ? errorExpanded
      ? "▾ click to collapse"
      : "▸ click for details"
    : "";

  return (
    <box flexDirection="column" width="100%">
      {/* ── One-line summary ──────────────────────────────────────────────── */}
      <box
        flexDirection="row"
        height={1}
        justifyContent="space-between"
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={Colors.card}
      >
        <box flexDirection="row" gap={1}>
          <CoolGlyph char="┌" />
          <text fg={modeColor} bold>
            [{modeLabel}]
          </text>
          <text fg={Colors["muted-foreground"]} dim>
            {apiHost}
          </text>
          <SummaryLine
            statusColor={
              ConnectionStatusColor[
                connectionStatus as keyof typeof ConnectionStatusColor
              ] ?? Colors.muted
            }
            pillInteractive={pillInteractive}
            onClick={toggleError}
            expandHint={expandHint}
          >
            {parts.join("  ")}
          </SummaryLine>
          <CoolGlyph char="┐" />
        </box>
        <text fg={Colors.dim} dim>
          ^P PALETTE · ^B SIDEBAR · ^Q QUIT
        </text>
      </box>

      {/* ── Expanded error panel (visible on click) ───────────────────────── */}
      {pillInteractive && errorExpanded && lastErrorDetails && (
        <ExpandedErrorPanel details={lastErrorDetails} />
      )}
    </box>
  );
}
