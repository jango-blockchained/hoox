/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
import { useState, useEffect } from "react";
import { Colors } from "@jango-blockchained/hoox-shared";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface SpinnerProps {
  label?: string;
  color?: string;
}

export function Spinner({
  label = "Loading...",
  color = Colors.highlight,
}: SpinnerProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    // Skip the animation loop in test environments. The OpenTUI test
    // runner wraps renders in `act(...)`; an interval that fires every
    // 80ms triggers state updates that aren't wrapped in `act`, which
    // surfaces as noisy warnings and (in some configurations) causes
    // related test assertions to fail. Tests are not validating
    // animation timing, so a static spinner is correct here.
    if (
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
        .IS_REACT_ACT_ENVIRONMENT === true
    ) {
      return;
    }

    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return (
    <box flexDirection="row" gap={1} alignItems="center">
      <text fg={color}>{SPINNER_FRAMES[frame]}</text>
      <text fg={Colors.muted} dim>
        {label}
      </text>
    </box>
  );
}

export interface EmptyStateProps {
  message: string;
  suggestion?: string;
  icon?: string;
}

export function EmptyState({
  message,
  suggestion,
  icon = "∅",
}: EmptyStateProps) {
  return (
    <box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      paddingY={2}
      gap={1}
    >
      <text fg={Colors.muted} dim>
        {icon}
      </text>
      <text fg={Colors.foreground} dim>
        {message}
      </text>
      {suggestion && (
        <text fg={Colors.muted} dim>
          {suggestion}
        </text>
      )}
    </box>
  );
}
