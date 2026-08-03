/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */

import { Colors, useUIStore } from "@hoox-sh/hoox-shared";
import { getSidebarItems } from "../../view-registry";
import { CoolBrackets, CoolGlyph } from "../shared/cool-brackets";

/**
 * Sidebar — left navigation panel with view links.
 * Near-black surface, cool animated brand brackets, indigo active state.
 */
export function Sidebar() {
  const activeView = useUIStore((s) => s.activeView);
  const sidebarExpanded = useUIStore((s) => s.sidebarExpanded);
  const setView = useUIStore((s) => s.setView);

  if (!sidebarExpanded) return null;

  const items = getSidebarItems();

  return (
    <box
      flexDirection="column"
      width={24}
      padding={1}
      gap={0}
      border={true}
      borderStyle="single"
      borderColor={Colors.border}
      backgroundColor={Colors.card}
    >
      {/* Brand header — cool animated brackets */}
      <CoolBrackets open="┌" close="┐" gap={1}>
        <text fg={Colors.foreground} bold>
          HOOX
        </text>
      </CoolBrackets>
      <text fg={Colors.dim}>─────────────────</text>

      {/* Navigation items */}
      {items.map((item) => {
        const isActive = item.id === activeView;
        return (
          <box flexDirection="row" gap={1} key={item.id}>
            {isActive ? <CoolGlyph char="▸" /> : <text fg={Colors.dim}> </text>}
            <text
              fg={isActive ? Colors.accent : Colors.muted}
              bold={isActive}
              onMouseUp={() => setView(item.id)}
            >
              {item.label}
            </text>
          </box>
        );
      })}

      {/* Shortcut hints */}
      <box flexGrow={1} />
      <text fg={Colors.dim} dim>
        Ctrl+0-9 · Ctrl+Alt+…
      </text>
    </box>
  );
}
