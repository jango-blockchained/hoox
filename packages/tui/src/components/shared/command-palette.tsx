/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * CommandPalette — an overlay modal with fuzzy-searchable command registry.
 *
 * Features:
 *   - Dimmed backdrop overlay (backdropOpacity).
 *   - Fuzzy-search input at top with caret indicator.
 *   - Results list: command name (bold), category badge (view/action/setting),
 *     shortcut hint on the right.
 *   - ↑↓ navigate results, Enter to select, Esc to dismiss.
 *   - Commands are provided via a registry prop so consumers can
 *     populate from views, actions, and settings.
 *
 * Colors use Hoox design tokens — no hardcoded hex.
 * Keyboard handling via @opentui/react useKeyboard hook.
 */
import { useState, useMemo } from "react";
import { useKeyboard } from "@opentui/react";
import { Colors } from "@jango-blockchained/hoox-shared";

// ── Types ──────────────────────────────────────────────────────────────────

/** Category tag for grouping commands in the palette */
export type CommandCategory = "view" | "action" | "setting";

/** A single command entry in the registry */
export interface CommandEntry {
  /** Unique command identifier */
  id: string;
  /** Display name shown in results (bold) */
  name: string;
  /** Category used for the badge */
  category: CommandCategory;
  /** Optional keyboard shortcut shown on the right */
  shortcut?: string;
  /** Optional search aliases to improve fuzzy matching */
  aliases?: string[];
  /** Extra description shown dimmed below the name */
  description?: string;
}

/** Result of selecting a command */
export interface CommandSelection {
  command: CommandEntry;
  /** Type of action to perform */
  action: "setView" | "execute";
}

export interface CommandPaletteProps {
  /** Whether the palette overlay is visible */
  visible: boolean;
  /** Registry of all available commands */
  commands: CommandEntry[];
  /** Called when user selects a command (Enter) or dismisses with Escape */
  onSelect: (selection: CommandSelection) => void;
  /** Called when user dismisses the palette (Escape) */
  onDismiss: () => void;
}

// ── Category badge colors ──────────────────────────────────────────────────

const CATEGORY_BADGE: Record<
  CommandCategory,
  { label: string; color: string }
> = {
  view: { label: "view", color: Colors.info },
  action: { label: "action", color: Colors.accent },
  setting: { label: "setting", color: Colors.warning },
};

// ── Fuzzy filter ───────────────────────────────────────────────────────────

/**
 * Simple fuzzy match — checks if all characters in `query` appear
 * in order within the candidate string (case-insensitive).
 */
function fuzzyMatch(query: string, candidate: string): boolean {
  const q = query.toLowerCase();
  const c = candidate.toLowerCase();
  let qi = 0;
  for (let ci = 0; ci < c.length && qi < q.length; ci++) {
    if (c[ci] === q[qi]) qi++;
  }
  return qi === q.length;
}

/** Score a command entry against a query (higher = better match) */
function scoreCommand(query: string, cmd: CommandEntry): number {
  if (!query) return 1; // no query, keep natural order
  const q = query.toLowerCase();

  // Exact prefix match on name is strongest
  if (cmd.name.toLowerCase().startsWith(q)) return 100;

  // Fuzzy match on name
  if (fuzzyMatch(q, cmd.name)) return 50;

  // Match in description
  if (cmd.description && fuzzyMatch(q, cmd.description)) return 30;

  // Match in aliases
  if (cmd.aliases?.some((a) => fuzzyMatch(q, a))) return 20;

  return -1; // no match
}

/** Filter and sort commands by fuzzy relevance */
function filterCommands(
  commands: CommandEntry[],
  query: string
): CommandEntry[] {
  if (!query.trim()) return commands;

  const scored = commands
    .map((cmd) => ({ cmd, score: scoreCommand(query, cmd) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score);

  // Deduplicate by id (keep highest score)
  const seen = new Set<string>();
  const deduped: CommandEntry[] = [];
  for (const { cmd } of scored) {
    if (!seen.has(cmd.id)) {
      seen.add(cmd.id);
      deduped.push(cmd);
    }
  }
  return deduped;
}

// ── Component ──────────────────────────────────────────────────────────────

export function CommandPalette({
  visible,
  commands,
  onSelect,
  onDismiss,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filtered & scored results
  const filtered = useMemo(
    () => filterCommands(commands, query),
    [commands, query]
  );

  // ── Keyboard handling (active only when visible) ─────────────────────

  useKeyboard((key) => {
    if (!visible) return;

    // Dismiss
    if (key.name === "escape") {
      setQuery("");
      setSelectedIndex(0);
      onDismiss();
      return;
    }

    // Navigate
    if (key.name === "up") {
      setSelectedIndex((i) =>
        i > 0 ? i - 1 : Math.max(0, filtered.length - 1)
      );
      return;
    }
    if (key.name === "down") {
      setSelectedIndex((i) => (i < filtered.length - 1 ? i + 1 : 0));
      return;
    }

    // Select
    if (key.name === "return") {
      const selected = filtered[selectedIndex];
      if (selected) {
        setQuery("");
        setSelectedIndex(0);
        onSelect({
          command: selected,
          action: selected.category === "view" ? "setView" : "execute",
        });
      }
      return;
    }

    // Delete
    if (key.name === "backspace" || key.name === "delete") {
      setQuery((q) => q.slice(0, -1));
      setSelectedIndex(0);
      return;
    }

    // Character input (printable keys only — no modifiers)
    if (
      key.sequence &&
      !key.ctrl &&
      !key.alt &&
      !key.meta &&
      key.sequence.length === 1 &&
      key.name !== "space" // space handled separately
    ) {
      const char = key.sequence;
      // Only accept printable ASCII
      if (char >= " " && char <= "~") {
        setQuery((q) => q + char);
        setSelectedIndex(0);
        return;
      }
    }

    // Space
    if (key.name === "space") {
      setQuery((q) => q + " ");
      setSelectedIndex(0);
    }
  });

  // ── Render (hidden when not visible) ────────────────────────────────

  if (!visible) return null;

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
    >
      {/* Modal container */}
      <box
        flexDirection="column"
        width={50}
        padding={1}
        gap={0}
        border={true}
        borderStyle="double"
        borderColor={Colors.accent}
        backgroundColor={Colors.background}
      >
        {/* ── Search input row ──────────────────────────────────────── */}
        <box flexDirection="row" gap={1} paddingLeft={1} paddingRight={1}>
          <text fg={Colors.accent}>▸</text>
          <text fg={Colors.foreground}>{query}</text>
          {/* Blinking caret */}
          <text fg={Colors.accent} blink>
            █
          </text>
        </box>

        {/* ── Divider ────────────────────────────────────────────────── */}
        <box
          height={1}
          border={true}
          borderStyle="single"
          borderColor={Colors.border}
        />

        {/* ── Results list ───────────────────────────────────────────── */}
        <box flexDirection="column" gap={0} paddingTop={0}>
          {filtered.length === 0 && query.length > 0 ? (
            /* No results state */
            <box paddingLeft={2} paddingTop={1} paddingBottom={1}>
              <text dim fg={Colors.muted}>
                No matching commands
              </text>
            </box>
          ) : (
            filtered.map((cmd, idx) => (
              <box
                flexDirection="row"
                justifyContent="space-between"
                paddingLeft={idx === selectedIndex ? 1 : 2}
                paddingRight={1}
                bg={idx === selectedIndex ? Colors.card : undefined}
              >
                {/* Left side: selection arrow + name + category badge */}
                <box flexDirection="row" gap={1}>
                  {idx === selectedIndex ? (
                    <text fg={Colors.accent}>▶</text>
                  ) : (
                    <text> </text>
                  )}
                  <text
                    fg={
                      idx === selectedIndex ? Colors.foreground : Colors.muted
                    }
                    bold
                  >
                    {cmd.name}
                  </text>
                  {/* Category badge */}
                  <text
                    fg={CATEGORY_BADGE[cmd.category].color}
                    dim={idx !== selectedIndex}
                  >
                    {CATEGORY_BADGE[cmd.category].label}
                  </text>
                </box>

                {/* Right side: shortcut hint */}
                <box flexDirection="row" gap={0}>
                  {cmd.shortcut && (
                    <text dim fg={Colors.muted}>
                      {cmd.shortcut}
                    </text>
                  )}
                </box>
              </box>
            ))
          )}
        </box>

        {/* ── Footer hint ────────────────────────────────────────────── */}
        <box
          flexDirection="row"
          justifyContent="flex-end"
          paddingTop={0}
          paddingRight={1}
        >
          <text dim fg={Colors.muted}>
            Esc to close
          </text>
        </box>
      </box>
    </box>
  );
}
