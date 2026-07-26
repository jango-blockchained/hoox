/** @jsxImportSource @opentui/react */
/**
 * ViewHeader — shared title row for high-traffic views.
 *
 * Cool-bracketed title on the left, optional right-side meta, dim rule under.
 * OpenTUI: never nest <text> inside <text>.
 */
import { Colors } from "@jango-blockchained/hoox-shared";
import type { ReactNode } from "react";
import { CoolBrackets } from "./cool-brackets";

export interface ViewHeaderProps {
  title: string;
  /** Right-aligned meta (counts, status) — string or sibling text nodes */
  meta?: ReactNode;
  /** Dim horizontal rule under the title row (default true) */
  showDivider?: boolean;
}

export function ViewHeader({
  title,
  meta,
  showDivider = true,
}: ViewHeaderProps) {
  return (
    <box
      flexDirection="row"
      gap={2}
      paddingBottom={showDivider ? 1 : 0}
      borderBottom={showDivider}
      borderStyle={showDivider ? "single" : undefined}
      borderColor={showDivider ? Colors.border : undefined}
      justifyContent="space-between"
      width="100%"
    >
      <CoolBrackets open="┌" close="┐" gap={1}>
        <text fg={Colors.accent} bold>
          {title}
        </text>
      </CoolBrackets>
      {meta ? (
        <box flexDirection="row" gap={1}>
          {meta}
        </box>
      ) : null}
    </box>
  );
}
