/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * CoolBrackets — static corner/pair brackets in brand accent colors.
 * No animation (no rainbow / spectrum cycling).
 */
import type { ReactNode } from "react";
import { Colors } from "@jango-blockchained/hoox-shared";

/**
 * Focus / accent color helper (static — kept for call-site compatibility).
 */
export function useCoolHue(
  _intervalMs = 120,
  enabled = true
): { color: string; index: number } {
  return {
    index: 0,
    color: enabled ? Colors.accent : Colors.border,
  };
}

export interface CoolBracketsProps {
  /** Content between the brackets */
  children?: ReactNode;
  /** Left glyph (default ┌) */
  open?: string;
  /** Right glyph (default ┐) */
  close?: string;
  /** @deprecated Ignored — animation removed */
  intervalMs?: number;
  /** @deprecated Always static now */
  static?: boolean;
  /** @deprecated Ignored — animation removed */
  phase?: number;
  /** Gap between open, children, close */
  gap?: number;
}

/**
 * Renders open + optional children + close with fixed accent colors.
 */
export function CoolBrackets({
  children,
  open = "┌",
  close = "┐",
  gap = 1,
}: CoolBracketsProps) {
  return (
    <box flexDirection="row" gap={gap} alignItems="center">
      <text fg={Colors.accent}>{open}</text>
      {children ?? null}
      <text fg={Colors.accent}>{close}</text>
    </box>
  );
}

/**
 * Inline single glyph in accent color (for ▸ markers, pipes, etc.).
 */
export function CoolGlyph({
  char,
}: {
  char: string;
  /** @deprecated Ignored — animation removed */
  intervalMs?: number;
  /** @deprecated Ignored — animation removed */
  phase?: number;
}) {
  return <text fg={Colors.accent}>{char}</text>;
}
