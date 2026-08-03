/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * AnimatedBorder — bordered panel chrome with static accent on focus.
 * (Name kept for call-site compatibility; no color animation.)
 *
 * On focus: border uses Colors.accent + double style.
 * Title: CoolBrackets around uppercase HUD label.
 */
import { type ReactNode } from "react";
import { Colors } from "@hoox-sh/hoox-shared";
import { CoolBrackets } from "./cool-brackets";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AnimatedBorderProps {
  /** Content to wrap with the border */
  children: ReactNode;
  /** Whether the contained element is focused/highlighted */
  focused?: boolean;
  /** Optional HUD-style panel title (rendered uppercase with accent brackets) */
  title?: string;
}

// ── Component ──────────────────────────────────────────────────────────────

export function AnimatedBorder({
  children,
  focused = false,
  title,
}: AnimatedBorderProps) {
  return (
    <box flexDirection="column" flexGrow={1}>
      {title && (
        <box flexDirection="row" gap={1} paddingLeft={1} paddingBottom={0}>
          <CoolBrackets open="┌" close="┐" gap={1}>
            <text fg={Colors["muted-foreground"]} bold>
              {title.toUpperCase()}
            </text>
          </CoolBrackets>
        </box>
      )}
      <box
        border={true}
        borderStyle={focused ? "double" : "single"}
        borderColor={focused ? Colors.accent : Colors.border}
        backgroundColor={Colors.card}
        flexGrow={1}
      >
        {children}
      </box>
    </box>
  );
}
