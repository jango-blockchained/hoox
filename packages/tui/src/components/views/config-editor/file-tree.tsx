/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * FileTree Component — Renders a flat list of file/directory nodes
 * from the tree structure with selection, focus, and unsaved indicators.
 */
import { useMemo } from "react";
import { Colors } from "@jango-blockchained/hoox-shared";
import type { FileNode } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileTreeProps {
  nodes: FileNode[];
  selectedPath: string | null;
  unsavedPaths: Set<string>;
  focusedPath: string | null;
  onSelectFile: (path: string) => void;
  level?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Renders a flat list of file/directory nodes from the tree structure. */
export function flattenTree(
  nodes: FileNode[],
  level: number = 0
): Array<{ node: FileNode; level: number }> {
  const result: Array<{ node: FileNode; level: number }> = [];
  for (const node of nodes) {
    result.push({ node, level });
    if (node.children) {
      result.push(...flattenTree(node.children, level + 1));
    }
  }
  return result;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FileTree({
  nodes,
  selectedPath,
  unsavedPaths,
  focusedPath,
  onSelectFile,
}: FileTreeProps) {
  const flatNodes = useMemo(() => flattenTree(nodes), [nodes]);

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      border={true}
      borderStyle="single"
      borderColor={Colors.border}
      paddingX={1}
      paddingY={0}
    >
      {/* Header */}
      <box paddingLeft={1} paddingRight={1} paddingTop={0} paddingBottom={0}>
        <text fg={Colors.accent} bold>
          FILES
        </text>
      </box>

      <text fg={Colors.border} dim>
        {"─".repeat(30)}
      </text>

      {/* File tree items */}
      <scrollbox width="100%" flexGrow={1} border={false}>
        {flatNodes.map(({ node, level }, _idx) => {
          const isSelected = node.path === selectedPath;
          const isFocused = node.path === focusedPath;
          const isUnsaved = node.type === "file" && unsavedPaths.has(node.path);
          const indent = "  ".repeat(level);

          // Prefix: directory gets ▶/▼, file gets space
          const prefix = node.type === "directory" ? "📁" : "  ";
          const marker = isUnsaved ? " [*]" : "";
          const label = `${indent}${prefix} ${node.name}${marker}`;

          return (
            <text
              key={node.path}
              fg={
                isSelected
                  ? Colors.accent
                  : isFocused
                    ? Colors.foreground
                    : node.type === "directory"
                      ? Colors.info
                      : Colors.foreground
              }
              bg={isSelected || isFocused ? Colors.card : undefined}
              bold={isSelected}
              onMouseUp={() => {
                if (node.type === "file") onSelectFile(node.path);
              }}
            >
              {label}
            </text>
          );
        })}
      </scrollbox>
    </box>
  );
}
