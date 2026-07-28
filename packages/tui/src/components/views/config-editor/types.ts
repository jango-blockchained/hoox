/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */

// ─── Shared Types for Config Editor ──────────────────────────────────────────

/** A node in the file tree (file or directory). */
export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
  isLoading?: boolean;
}

/** Validation error discovered during syntax check. */
export interface SyntaxErrorEntry {
  line: number;
  column: number;
  message: string;
}

/** Pane focus target for tab cycling. */
export type ActivePane = "tree" | "editor";

/** Colored segment within a single line of TOML/JSON. */
export interface TokenSpan {
  text: string;
  color: string;
  bold: boolean;
}

/** Determine file type from path extension. */
export type FileType = "toml" | "json" | "env" | "unknown";
