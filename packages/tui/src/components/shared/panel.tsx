/** @jsxImportSource @opentui/react */
/**
 * Panel — shared bordered card chrome for list/detail sections.
 *
 * Near-black card surface; cool indigo border when focused.
 * compact uses zero padding; otherwise padding 1.
 */
import { Colors } from "@jango-blockchained/hoox-shared";
import type { ReactNode } from "react";
import { useCoolHue } from "./cool-brackets";

export interface PanelProps {
  title?: string;
  focused?: boolean;
  /** Card background when true (default). Also on when focused. */
  elevated?: boolean;
  /** Zero padding when true; otherwise padding 1 */
  compact?: boolean;
  width?: number | string;
  flexGrow?: number;
  /**
   * Override border color (e.g. kill-switch engaged → error).
   * When set, wins over focused cool hue / default border.
   */
  borderColor?: string;
  children?: ReactNode;
}

export function Panel({
  title,
  focused = false,
  elevated = true,
  compact = false,
  width,
  flexGrow,
  borderColor,
  children,
}: PanelProps) {
  const { color: cool } = useCoolHue(180, focused);
  const resolvedBorder = borderColor ?? (focused ? cool : Colors.border);

  return (
    <box
      flexDirection="column"
      width={width}
      flexGrow={flexGrow}
      padding={compact ? 0 : 1}
      border={true}
      borderStyle="single"
      borderColor={resolvedBorder}
      backgroundColor={elevated || focused ? Colors.card : Colors.background}
      title={title}
    >
      {children}
    </box>
  );
}
