/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * QuitModal — full-screen quit confirmation overlay.
 *
 * Centered card with double accent border on a solid background scrim.
 * Labels: [Y/Enter] Quit · [N/Esc] Cancel (mouse-up handlers for click).
 * Keyboard handling (Y/Enter/N/Esc) remains in AppRoot.
 */
import { Colors } from "@hoox-sh/hoox-shared";

export interface QuitModalProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function QuitModal({
  title,
  message,
  onConfirm,
  onCancel,
}: QuitModalProps) {
  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      justifyContent="center"
      alignItems="center"
      backgroundColor={Colors.background}
    >
      <box
        flexDirection="column"
        gap={1}
        padding={2}
        border={true}
        borderStyle="double"
        borderColor={Colors.accent}
        backgroundColor={Colors.card}
        minWidth={40}
      >
        <text fg={Colors.accent} bold>
          {title}
        </text>
        <text fg={Colors.foreground}>{message}</text>
        <box flexDirection="row" gap={2} paddingTop={1}>
          <text fg={Colors.error} bold onMouseUp={onConfirm}>
            [Y/Enter] Quit
          </text>
          <text fg={Colors.muted} onMouseUp={onCancel}>
            [N/Esc] Cancel
          </text>
        </box>
      </box>
    </box>
  );
}
