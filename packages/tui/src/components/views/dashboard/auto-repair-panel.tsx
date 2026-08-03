/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
import { Colors } from "@hoox-sh/hoox-shared";

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * A single fix action result from `hoox check fix`.
 * Mirrors the CLI's FixAction shape (`packages/cli/src/commands/check/types.ts`).
 */
export interface RepairFixItem {
  /** Human-readable description of the fix. */
  description: string;
  /** Type of fix: file, binding, flag, or config. */
  type: "file" | "binding" | "flag" | "config";
  /** Target path or identifier. */
  target: string;
  /** Whether the fix was successfully applied. */
  applied: boolean;
  /** Error message if application failed. */
  error?: string;
  /** Timestamp when the fix was attempted. */
  timestamp: number;
}

/**
 * UI state for the Auto-Repair results panel.
 */
export type RepairState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "error"; message: string }
  | { kind: "results"; items: RepairFixItem[]; durationMs: number };

// ─── Sub-Components ────────────────────────────────────────────────────────────

/**
 * Status badge for a single repair item: APPLIED, FAILED, or SKIPPED.
 */
export function RepairStatusBadge({
  status,
}: {
  status: "applied" | "failed" | "skipped";
}) {
  if (status === "applied") {
    return (
      <text fg={Colors.success} bold>
        [APPLIED]
      </text>
    );
  }
  if (status === "failed") {
    return (
      <text fg={Colors.error} bold>
        [FAILED]
      </text>
    );
  }
  return (
    <text fg={Colors.warning} bold>
      [SKIPPED]
    </text>
  );
}

/**
 * Format a timestamp (ms) to HH:MM:SS for display.
 */
export function formatRepairTime(ts: number): string {
  const d = new Date(ts);
  return [
    d.getHours().toString().padStart(2, "0"),
    d.getMinutes().toString().padStart(2, "0"),
    d.getSeconds().toString().padStart(2, "0"),
  ].join(":");
}

/**
 * AutoRepairPanel — shows repair results below the health section.
 * Displays each fix item with timestamp, description, and status.
 * Persists until the user dismisses with ESC or the [DISMISS] button.
 */
export function AutoRepairPanel({
  state,
  onDismiss,
  onRerun,
}: {
  state: RepairState;
  onDismiss: () => void;
  onRerun: () => void;
}) {
  return (
    <box
      flexDirection="column"
      border={true}
      borderStyle="single"
      borderColor={Colors.border}
      backgroundColor={Colors.card}
      paddingX={1}
      paddingY={0}
      gap={0}
    >
      {/* Header row */}
      <box flexDirection="row" gap={2}>
        <text fg={Colors.accent} bold>
          AUTO-REPAIR RESULTS
        </text>
        {state.kind === "results" && (
          <>
            <text fg={Colors.success} bold>
              {state.items.filter((i) => i.applied).length} applied
            </text>
            <text
              fg={
                state.items.filter((i) => i.error).length > 0
                  ? Colors.error
                  : Colors.muted
              }
              bold={state.items.filter((i) => i.error).length > 0}
            >
              {state.items.filter((i) => i.error).length} failed
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
      <text fg={Colors.border} dim>
        {"─".repeat(80)}
      </text>

      {/* Error state */}
      {state.kind === "error" && (
        <box flexDirection="column" gap={0} paddingTop={1}>
          <text fg={Colors.error} bold>
            Auto-repair failed to run:
          </text>
          <text fg={Colors.foreground}>{state.message}</text>
        </box>
      )}

      {/* Running state */}
      {state.kind === "running" && (
        <box flexDirection="column" gap={0} paddingTop={1}>
          <text fg={Colors.muted} dim>
            Running `hoox check fix` — this may take up to 60 seconds.
          </text>
        </box>
      )}

      {/* Results state */}
      {state.kind === "results" && (
        <box flexDirection="column" gap={0} paddingTop={1}>
          {state.items.length === 0 ? (
            <text fg={Colors.muted} dim>
              No repairs were needed — all checks passed.
            </text>
          ) : (
            state.items.map((item, idx) => {
              const status: "applied" | "failed" | "skipped" = item.error
                ? "failed"
                : item.applied
                  ? "applied"
                  : "skipped";
              return (
                <box
                  key={`repair-${idx}-${item.target}`}
                  flexDirection="column"
                  gap={0}
                >
                  <box flexDirection="row" gap={1} paddingLeft={1}>
                    <RepairStatusBadge status={status} />
                    <text fg={Colors.foreground} bold={status === "failed"}>
                      {item.description}
                    </text>
                  </box>
                  {/* Target */}
                  <text fg={Colors.dim} dim paddingLeft={6}>
                    {"  target: "}
                    {item.target}
                  </text>
                  {/* Error details */}
                  {item.error && (
                    <text fg={Colors.error} paddingLeft={6}>
                      {"  error: "}
                      {item.error}
                    </text>
                  )}
                </box>
              );
            })
          )}
        </box>
      )}
    </box>
  );
}
