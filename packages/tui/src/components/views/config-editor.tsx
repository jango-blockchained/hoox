/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * Config Editor View — VS Code-style split pane for editing TOML/JSON config.
 *
 * Layout (left → right, bottom bar):
 *   1. FileTree (left pane, 25%): directory structure of config/ files.
 *      Unsaved files marked with [*] indicator.
 *   2. CodeEditor (right pane, 75%): scrollable text with line numbers
 *      and basic TOML/JSON syntax highlighting via design tokens.
 *   3. ActionBar (footer): [Save] [Validate] [Diff] [Format] + unsaved counter.
 *
 * Keyboard:
 *   - Tab: switch focus between tree and editor panes
 *   - ↑↓: navigate file tree / scroll editor
 *   - Enter: select file in tree
 *   - Ctrl+S: save current file
 *   - Ctrl+Z: undo last change
 *   - Ctrl+Y: redo last change
 *   - Ctrl+F: find in file
 *
 * File operations use Bun native I/O. Config directory path is resolved from
 * cwd (./config/) with a fallback to the hoox config dir (~/.hoox/config/).
 *
 * Follows TUI Patterns 1 (View Composition), 2 (Store Subscription),
 * 5 (Color Token Usage), 8 (ScrollBox).
 * Colors from @hoox-sh/hoox-shared design tokens. No CSS, no DOM.
 */
import { existsSync } from "node:fs";
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useKeyboard } from "@opentui/react";
import {
  Colors,
  getHooxRepoPath,
  resolveHooxRuntimeRoot,
  useUIStore,
} from "@hoox-sh/hoox-shared";
import { ErrorBoundary } from "../shared/error-boundary";
import { ViewHeader } from "../shared/view-header";
import { cliBridge } from "../../services/cli-bridge";

// ─── Extracted submodules ─────────────────────────────────────────────────────

import type {
  FileNode,
  SyntaxErrorEntry,
  ActivePane,
} from "./config-editor/types";
import { FileTree } from "./config-editor/file-tree";
import {
  CodeEditor,
  detectFileType,
  validateSyntax,
  formatContent,
} from "./config-editor/code-editor";
import { ActionBar } from "./config-editor/action-bar";

// Re-export extracted types and functions for backward compatibility
export type {
  FileNode,
  SyntaxErrorEntry,
  ActivePane,
  TokenSpan,
  FileType,
} from "./config-editor/types";
export { flattenTree } from "./config-editor/file-tree";
export {
  tokenizeTomlLine,
  tokenizeJsonLine,
  detectFileType,
  validateSyntax,
  formatContent,
} from "./config-editor/code-editor";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Project-root candidates that may contain a `config/` directory.
 * Blueprint paths are always relative to the *project root* (e.g.
 * `config/wrangler.toml`), never to the config dir itself — that
 * avoids the double-prefix bug (`…/config/config/…`).
 */
const PROJECT_ROOT_CANDIDATES = [".", "..", "../..", "packages/tui"];

/** Known config files — used as the tree blueprint. Content is lazy-loaded. */
export const CONFIG_TREE_BLUEPRINT: FileNode[] = [
  {
    name: "config",
    path: "config",
    type: "directory",
    children: [
      { name: "wrangler.toml", path: "config/wrangler.toml", type: "file" },
      {
        name: "trade.config.json",
        path: "config/trade.config.json",
        type: "file",
      },
      {
        name: "risk.config.json",
        path: "config/risk.config.json",
        type: "file",
      },
      {
        name: "strategies",
        path: "config/strategies",
        type: "directory",
        children: [
          {
            name: "grid.config.json",
            path: "config/strategies/grid.config.json",
            type: "file",
          },
          {
            name: "macd.config.json",
            path: "config/strategies/macd.config.json",
            type: "file",
          },
          {
            name: "scalping.config.json",
            path: "config/strategies/scalping.config.json",
            type: "file",
          },
        ],
      },
      { name: ".env", path: "config/.env", type: "file" },
    ],
  },
];

// ─── Helpers — File I/O (Bun native) ──────────────────────────────────────────

/** Cache of resolved project root (lazy, memoized). */
let _resolvedProjectRoot: string | null = null;

/**
 * Resolve the monorepo/project root that contains a `config/` folder.
 * Blueprint file paths are joined under this root.
 *
 * @internal Exported for tests; call {@link resetResolvedConfigDir} between tests.
 */
export function resolveConfigDir(): string {
  if (_resolvedProjectRoot) return _resolvedProjectRoot;
  const cwd =
    typeof process !== "undefined" && process.cwd ? process.cwd() : ".";

  // Prefer resolved runtime monorepo (cwd / HOOX_REPO / ~/.hoox/repo)
  const runtime = resolveHooxRuntimeRoot({ cwd });
  for (const base of [runtime.root, getHooxRepoPath()].filter(
    Boolean
  ) as string[]) {
    if (configDirExists(base)) {
      _resolvedProjectRoot = normalizePath(base);
      return _resolvedProjectRoot;
    }
  }

  for (const cand of PROJECT_ROOT_CANDIDATES) {
    const base = normalizePath(`${cwd}/${cand}`);
    if (configDirExists(base)) {
      _resolvedProjectRoot = base;
      return base;
    }
  }

  // Fallback: cwd (blueprint paths still start with config/…)
  _resolvedProjectRoot = normalizePath(cwd);
  return _resolvedProjectRoot;
}

/** Reset memoized project root (tests only). */
export function resetResolvedConfigDir(): void {
  _resolvedProjectRoot = null;
}

function normalizePath(p: string): string {
  return (
    p
      .replace(/\/\.\//g, "/")
      .replace(/\/+/g, "/")
      .replace(/\/$/, "") || "."
  );
}

function configDirExists(projectRoot: string): boolean {
  try {
    if (existsSync(`${projectRoot}/config`)) return true;
    // Monorepo root without a top-level config/ still needs project root so
    // blueprint paths (`config/…`) never double-prefix under …/config/config.
    if (
      existsSync(`${projectRoot}/package.json`) &&
      (existsSync(`${projectRoot}/packages`) ||
        existsSync(`${projectRoot}/wrangler.jsonc`))
    ) {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/** Join a blueprint-relative path onto the resolved project root. */
export function resolveConfigFilePath(relativePath: string): string {
  const root = resolveConfigDir();
  // Strip a leading `./` and collapse accidental double `config/config`
  let rel = relativePath.replace(/^\.\//, "");
  if (root.endsWith("/config") && rel.startsWith("config/")) {
    rel = rel.slice("config/".length);
  }
  return normalizePath(`${root}/${rel}`);
}

/** Read a config file from disk. Returns empty string if the file doesn't exist. */
async function loadFileContent(relativePath: string): Promise<string> {
  const fullPath = resolveConfigFilePath(relativePath);
  try {
    const f = Bun.file(fullPath);
    const exists = await f.exists();
    return exists ? await f.text() : "";
  } catch {
    return `# ${relativePath}\n# File not found at ${fullPath}\n`;
  }
}

/** Write content to a config file on disk. */
async function saveFileContent(
  relativePath: string,
  content: string
): Promise<void> {
  const fullPath = resolveConfigFilePath(relativePath);
  await Bun.write(fullPath, content);
}

// ─── Main ConfigEditor View ──────────────────────────────────────────────────

export function ConfigEditor() {
  const activeView = useUIStore((s) => s.activeView);
  const isActive = activeView === "config-editor";

  // ── State ──────────────────────────────────────────────────────────────
  const [fileContents, setFileContents] = useState<Map<string, string>>(
    new Map()
  );
  const [originalContents, setOriginalContents] = useState<Map<string, string>>(
    new Map()
  );
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [unsavedPaths, setUnsavedPaths] = useState<Set<string>>(new Set());
  const [syntaxErrors, setSyntaxErrors] = useState<SyntaxErrorEntry[]>([]);
  const [activePane, setActivePane] = useState<ActivePane>("tree");
  const [focusedTreeIdx, setFocusedTreeIdx] = useState(0);
  const [editorScrollOffset, setEditorScrollOffset] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);

  // ── Derived ────────────────────────────────────────────────────────────
  const fileTree = useMemo(() => CONFIG_TREE_BLUEPRINT, []);
  const flatFiles = useMemo(() => {
    const files: FileNode[] = [];
    function walk(nodes: FileNode[]) {
      for (const n of nodes) {
        if (n.type === "file") files.push(n);
        if (n.children) walk(n.children);
      }
    }
    walk(fileTree);
    return files;
  }, [fileTree]);

  const currentContent = selectedFile
    ? (fileContents.get(selectedFile) ?? "")
    : "";
  const fileType = selectedFile ? detectFileType(selectedFile) : "unknown";
  const unsavedCount = unsavedPaths.size;

  const safeFocusedIdx = Math.max(
    0,
    Math.min(focusedTreeIdx, flatFiles.length - 1)
  );
  const focusedFilePath = flatFiles[safeFocusedIdx]?.path ?? null;

  // ── Callbacks ──────────────────────────────────────────────────────────

  const selectFile = useCallback(
    async (path: string) => {
      if (fileContents.has(path)) {
        // Already loaded — just switch
        setSelectedFile(path);
        setActivePane("editor");
        return;
      }
      // Lazy-load content from disk
      const content = await loadFileContent(path);
      setFileContents((prev) => new Map(prev).set(path, content));
      setOriginalContents((prev) => new Map(prev).set(path, content));
      setSelectedFile(path);
      setActivePane("editor");
      setSyntaxErrors([]);
      setEditorScrollOffset(0);
      setValidationError(null);
      setStatusMessage(`Loaded: ${path}`);
    },
    [fileContents]
  );

  const prevContentRef = useRef(currentContent);
  useEffect(() => {
    if (!selectedFile || !currentContent) return;
    if (
      prevContentRef.current !== currentContent &&
      prevContentRef.current !== ""
    ) {
      setUndoStack((stack) => {
        const next = [...stack, prevContentRef.current];
        return next.slice(-50);
      });
      setRedoStack([]);
    }
    prevContentRef.current = currentContent;
  }, [currentContent, selectedFile]);

  const handleSave = useCallback(async () => {
    if (!selectedFile) return;
    try {
      await saveFileContent(selectedFile, currentContent);
      setOriginalContents((prev) =>
        new Map(prev).set(selectedFile, currentContent)
      );
      setUnsavedPaths((prev) => {
        const next = new Set(prev);
        next.delete(selectedFile);
        return next;
      });
      setStatusMessage(`Saved: ${selectedFile}`);
      setValidationError(null);
      const result = await cliBridge.configValidate();
      if (!result.success) {
        const errMsg =
          result.stderr || result.stdout || "Unknown validation error";
        setValidationError(errMsg);
        setStatusMessage(`Saved — Validation failed: ${errMsg}`);
      } else {
        setValidationError(null);
        setStatusMessage("Saved — Config valid");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusMessage(`Failed to save: ${msg}`);
    }
  }, [selectedFile, currentContent]);

  const handleValidate = useCallback(async () => {
    if (!selectedFile) return;
    const errors = validateSyntax(currentContent, fileType);
    setSyntaxErrors(errors);
    setValidationError(null);
    const result = await cliBridge.configValidate();
    if (!result.success) {
      const errMsg =
        result.stderr || result.stdout || "Unknown validation error";
      setValidationError(errMsg);
      setStatusMessage(`Validation failed: ${errMsg}`);
    } else {
      setValidationError(null);
      if (errors.length === 0) {
        setStatusMessage("Validation passed — Config is valid");
      } else {
        setStatusMessage(
          `Found ${errors.length} syntax error${errors.length > 1 ? "s" : ""}`
        );
      }
    }
  }, [selectedFile, currentContent, fileType]);

  const handleDiff = useCallback(() => {
    // Basic diff: show original vs current line counts
    const original = selectedFile
      ? (originalContents.get(selectedFile) ?? "")
      : "";
    const origLines = original.split("\n").length;
    const currLines = currentContent.split("\n").length;
    const diff = currLines - origLines;
    if (diff === 0) {
      setStatusMessage(`No changes: ${origLines} lines unchanged`);
    } else {
      setStatusMessage(
        `Diff: ${origLines} → ${currLines} lines (${diff > 0 ? "+" : ""}${diff})`
      );
    }
  }, [selectedFile, originalContents, currentContent]);

  const handleFormat = useCallback(() => {
    if (!selectedFile) return;
    const formatted = formatContent(currentContent, fileType);
    setFileContents((prev) => new Map(prev).set(selectedFile, formatted));
    // Mark as unsaved only if content actually changed
    if (formatted !== currentContent) {
      setUnsavedPaths((prev) => new Set(prev).add(selectedFile));
    }
    setStatusMessage(`Formatted: ${selectedFile}`);
  }, [selectedFile, currentContent, fileType]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0 || !selectedFile) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((s) => [...s, currentContent]);
    setFileContents((contents) => new Map(contents).set(selectedFile!, prev));
    setUnsavedPaths((paths) => new Set(paths).add(selectedFile!));
    setStatusMessage("Undo");
  }, [undoStack, currentContent, selectedFile]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0 || !selectedFile) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((s) => s.slice(0, -1));
    setUndoStack((s) => [...s, currentContent]);
    setFileContents((prev) => new Map(prev).set(selectedFile!, next));
    setUnsavedPaths((paths) => new Set(paths).add(selectedFile!));
    setStatusMessage("Redo");
  }, [redoStack, currentContent, selectedFile]);

  const [findMode, setFindMode] = useState(false);
  const [findQuery, setFindQuery] = useState("");

  const handleFind = useCallback(() => {
    setFindMode((p) => !p);
    if (!findMode) {
      setFindQuery("");
      setStatusMessage("Find: type to search, Esc to close");
    } else {
      setStatusMessage("");
    }
  }, [findMode]);

  // ── Keyboard (only when this view is active) ───────────────────────────

  useKeyboard((key) => {
    if (!isActive) return;
    if (key.ctrl && key.name === "z") {
      handleUndo();
      return;
    }
    if (key.ctrl && key.name === "y") {
      handleRedo();
      return;
    }
    if (key.ctrl && key.name === "f") {
      handleFind();
      return;
    }

    if (findMode) {
      if (key.name === "escape") {
        setFindMode(false);
        setStatusMessage("");
        return;
      }
      if (key.name === "backspace" || key.name === "delete") {
        setFindQuery((q) => q.slice(0, -1));
        return;
      }
      if (key.name === "return") {
        return;
      }
      if (key.sequence && key.sequence.length === 1 && key.sequence >= " ") {
        setFindQuery((q) => q + key.sequence);
        return;
      }
      return;
    }

    if (key.name === "tab") {
      setActivePane((p) => (p === "tree" ? "editor" : "tree"));
    }

    if (activePane === "tree") {
      switch (key.name) {
        case "up":
          setFocusedTreeIdx((i) => Math.max(0, i - 1));
          break;
        case "down":
          setFocusedTreeIdx((i) => Math.min(flatFiles.length - 1, i + 1));
          break;
        case "enter":
          if (focusedFilePath) selectFile(focusedFilePath);
          break;
      }
    }

    if (activePane === "editor") {
      switch (key.name) {
        case "up":
          setEditorScrollOffset((o) => Math.max(0, o - 1));
          break;
        case "down":
          setEditorScrollOffset((o) => o + 1);
          break;
      }
    }

    if (key.ctrl && key.name === "s" && selectedFile) {
      handleSave();
    }
  });

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <ErrorBoundary viewName="Config Editor">
      <box flexDirection="column" flexGrow={1} padding={1} gap={0}>
        <ViewHeader
          title="CONFIG VIEWER"
          meta={
            <box flexDirection="row" gap={1} alignItems="center">
              <text fg={Colors.muted} dim>
                format/save only · free-text edit via external editor
              </text>
              {statusMessage ? (
                <text fg={Colors.info} dim>
                  · {statusMessage}
                </text>
              ) : null}
            </box>
          }
        />

        {/* Main split pane: FileTree | CodeEditor */}
        <box flexDirection="row" flexGrow={1} gap={1}>
          {/* Left: FileTree */}
          <box width={28} flexDirection="column">
            <FileTree
              nodes={fileTree}
              selectedPath={selectedFile}
              unsavedPaths={unsavedPaths}
              focusedPath={activePane === "tree" ? focusedFilePath : null}
              onSelectFile={selectFile}
            />
          </box>

          {/* Right: CodeEditor */}
          <box flexGrow={1} flexDirection="column">
            <CodeEditor
              content={currentContent}
              fileType={fileType}
              fileName={selectedFile}
              syntaxErrors={syntaxErrors}
              scrollOffset={editorScrollOffset}
            />
          </box>
        </box>

        {/* Validation status */}
        {validationError && (
          <box paddingLeft={1} paddingBottom={0} flexDirection="row" gap={1}>
            <text fg={Colors.error} bold>
              ⚠
            </text>
            <text fg={Colors.error}>Validation: {validationError}</text>
          </box>
        )}

        {findMode && (
          <box flexDirection="row" gap={1} paddingLeft={1} paddingBottom={0}>
            <text fg={Colors.accent} bold>
              Find:
            </text>
            <text fg={Colors.foreground}>{findQuery}</text>
            <text fg={Colors.muted} dim>
              {findQuery
                ? ` (${currentContent.toLowerCase().split(findQuery.toLowerCase()).length - 1} matches)`
                : ""}
            </text>
          </box>
        )}

        {/* Footer: ActionBar */}
        <text fg={Colors.border} dim>
          {"─".repeat(80)}
        </text>
        <ActionBar
          unsavedCount={unsavedCount}
          hasSelectedFile={selectedFile !== null}
          hasErrors={syntaxErrors.length > 0}
          onSave={handleSave}
          onValidate={handleValidate}
          onDiff={handleDiff}
          onFormat={handleFormat}
        />
      </box>
    </ErrorBoundary>
  );
}
