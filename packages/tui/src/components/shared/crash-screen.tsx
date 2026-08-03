/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * Crash Screen — rendered when an unhandled error escapes all error boundaries.
 *
 * Displays:
 *   - "Something went wrong" banner
 *   - Error message (first line)
 *   - Three action buttons: [Restart] [Safe Mode] [Report Bug]
 *
 * This component is a plain function (not a class) because it's meant to be
 * rendered in a degraded state — no hooks, no stores, no external state.
 * Colors use Hoox design tokens via @hoox-sh/hoox-shared.
 */
import { Colors } from "@hoox-sh/hoox-shared";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CrashAction = "restart" | "safe-mode" | "report-bug";

export interface CrashScreenProps {
  /** The error that caused the crash */
  error: Error;
  /** Callback for crash action buttons */
  onAction: (action: CrashAction) => void;
  /** Whether we're in safe mode (affects display) */
  safeMode?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CrashScreen({
  error,
  onAction,
  safeMode = false,
}: CrashScreenProps) {
  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      justifyContent="center"
      alignItems="center"
      padding={2}
      gap={2}
      backgroundColor={Colors.background}
    >
      {/* ── Banner ───────────────────────────────────────────────────────── */}
      <box
        flexDirection="column"
        alignItems="center"
        border={true}
        borderStyle="double"
        borderColor={Colors.error}
        padding={2}
        gap={1}
        backgroundColor={Colors.card}
      >
        {/* Title */}
        <text fg={Colors.error} bold>
          ╔══════════════════════════════════════╗
        </text>
        <text fg={Colors.error} bold>
          ║ Something went wrong ║
        </text>
        <text fg={Colors.error} bold>
          ╚══════════════════════════════════════╝
        </text>

        {/* Safe mode indicator */}
        {safeMode && (
          <text fg={Colors.warning} bold>
            (Running in Safe Mode — minimal config, no API calls)
          </text>
        )}

        {/* Error message */}
        <box paddingTop={1} flexDirection="column" alignItems="center">
          <text fg={Colors.muted}>{error.message.split("\n")[0]}</text>
          {/* Show second line if present (e.g. stack trace hint) */}
          {error.message.includes("\n") && (
            <text fg={Colors.dim} dim>
              {error.message.split("\n")[1]?.slice(0, 80)}
            </text>
          )}
        </box>
      </box>

      {/* ── Action Buttons ───────────────────────────────────────────────── */}
      <box flexDirection="row" gap={2} paddingTop={1}>
        {/* [Restart] — re-initialize the renderer */}
        <box
          border={true}
          borderStyle="single"
          borderColor={Colors.accent}
          paddingLeft={2}
          paddingRight={2}
        >
          <text
            fg={Colors.accent}
            bg={Colors.card}
            onMouseUp={() => onAction("restart")}
          >
            {"  [Restart]  "}
          </text>
        </box>

        {/* [Safe Mode] — start with minimal config */}
        {!safeMode && (
          <box
            border={true}
            borderStyle="single"
            borderColor={Colors.warning}
            paddingLeft={2}
            paddingRight={2}
          >
            <text
              fg={Colors.warning}
              bg={Colors.card}
              onMouseUp={() => onAction("safe-mode")}
            >
              {"  [Safe Mode]  "}
            </text>
          </box>
        )}

        {/* [Report Bug] — write error to file / console */}
        <box
          border={true}
          borderStyle="single"
          borderColor={Colors.muted}
          paddingLeft={2}
          paddingRight={2}
        >
          <text
            fg={Colors.muted}
            bg={Colors.card}
            onMouseUp={() => onAction("report-bug")}
          >
            {"  [Report Bug]  "}
          </text>
        </box>
      </box>
    </box>
  );
}
