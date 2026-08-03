/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * CodeEditor Component — Scrollable text editor with line numbers
 * and basic TOML/JSON syntax highlighting via design tokens.
 */
import { useMemo } from "react";
import { Colors } from "@hoox-sh/hoox-shared";
import { parse as parseToml, TomlError } from "smol-toml";
import type { SyntaxErrorEntry, TokenSpan, FileType } from "./types";

// ─── Syntax Highlighting — TOML ───────────────────────────────────────────────

/** Simple TOML token types recognized by the highlighter. */
type TomlTokenType =
  | "comment"
  | "section"
  | "key"
  | "equals"
  | "value"
  | "string"
  | "number"
  | "boolean"
  | "whitespace"
  | "error";

/** Color map for TOML token types. */
const TOML_COLORS: Record<TomlTokenType, { fg: string; bold: boolean }> = {
  comment: { fg: Colors.muted, bold: false },
  section: { fg: Colors.accent, bold: true },
  key: { fg: Colors.accent, bold: false },
  equals: { fg: Colors.foreground, bold: false },
  value: { fg: Colors.foreground, bold: false },
  string: { fg: Colors.info, bold: false },
  number: { fg: Colors.foreground, bold: false },
  boolean: { fg: Colors.info, bold: false },
  whitespace: { fg: Colors.foreground, bold: false },
  error: { fg: Colors.error, bold: true },
};

/**
 * Tokenize a single line of TOML text into colored spans.
 *
 * Priority order:
 *   1. Full-line comment (# at start or after whitespace)
 *   2. Section header ([...])
 *   3. Inline comment (trailing #)
 *   4. key = value with string/number/boolean detection
 */
export function tokenizeTomlLine(line: string): TokenSpan[] {
  const spans: TokenSpan[] = [];
  const trimmed = line.trimStart();
  const leadingWsLen = line.length - trimmed.length;

  // Leading whitespace
  if (leadingWsLen > 0) {
    spans.push({
      text: line.slice(0, leadingWsLen),
      color: TOML_COLORS.whitespace.fg,
      bold: false,
    });
  }

  if (trimmed.length === 0) return spans;

  // Full-line comment
  if (trimmed.startsWith("#")) {
    spans.push({ text: trimmed, color: TOML_COLORS.comment.fg, bold: false });
    return spans;
  }

  // Section header [section.name]
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    if (end !== -1) {
      spans.push({
        text: trimmed.slice(0, end + 1),
        color: TOML_COLORS.section.fg,
        bold: true,
      });
      const rest = trimmed.slice(end + 1);
      if (rest.length > 0) {
        if (rest.trimStart().startsWith("#")) {
          spans.push({
            text: rest,
            color: TOML_COLORS.comment.fg,
            bold: false,
          });
        } else {
          spans.push({
            text: rest,
            color: TOML_COLORS.whitespace.fg,
            bold: false,
          });
        }
      }
      return spans;
    }
  }

  // key = value
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx !== -1) {
    const keyPart = trimmed.slice(0, eqIdx).trimEnd();
    // Check for trailing # comment after =
    const postEq = trimmed.slice(eqIdx + 1);
    const commentIdx = findCommentIndex(postEq);
    const valuePart =
      commentIdx !== -1 ? postEq.slice(0, commentIdx).trim() : postEq.trim();
    const commentPart = commentIdx !== -1 ? postEq.slice(commentIdx) : "";

    // Key
    spans.push({ text: keyPart, color: TOML_COLORS.key.fg, bold: false });
    // Equals
    spans.push({ text: " = ", color: TOML_COLORS.equals.fg, bold: false });

    // Value (detect type)
    if (valuePart.startsWith('"') || valuePart.startsWith("'")) {
      spans.push({
        text: valuePart,
        color: TOML_COLORS.string.fg,
        bold: false,
      });
    } else if (valuePart === "true" || valuePart === "false") {
      spans.push({
        text: valuePart,
        color: TOML_COLORS.boolean.fg,
        bold: false,
      });
    } else if (/^-?\d+(\.\d+)?(e[+-]?\d+)?$/.test(valuePart)) {
      spans.push({
        text: valuePart,
        color: TOML_COLORS.number.fg,
        bold: false,
      });
    } else {
      spans.push({ text: valuePart, color: TOML_COLORS.value.fg, bold: false });
    }

    if (commentPart) {
      spans.push({
        text: commentPart,
        color: TOML_COLORS.comment.fg,
        bold: false,
      });
    }
    return spans;
  }

  // Fallback: plain text
  spans.push({ text: trimmed, color: TOML_COLORS.value.fg, bold: false });
  return spans;
}

// ─── Syntax Highlighting — JSON ───────────────────────────────────────────────

/** Color map for JSON token types. */
const JSON_COLORS: Record<string, { fg: string; bold: boolean }> = {
  brace: { fg: Colors.foreground, bold: false },
  key: { fg: Colors.accent, bold: false },
  colon: { fg: Colors.foreground, bold: false },
  string: { fg: Colors.info, bold: false },
  number: { fg: Colors.foreground, bold: false },
  boolean: { fg: Colors.info, bold: false },
  null: { fg: Colors.muted, bold: false },
  comma: { fg: Colors.foreground, bold: false },
  whitespace: { fg: Colors.foreground, bold: false },
  error: { fg: Colors.error, bold: true },
  comment: { fg: Colors.muted, bold: false },
};

/**
 * Tokenize a single line of JSON text into colored spans.
 */
export function tokenizeJsonLine(line: string): TokenSpan[] {
  const trimmed = line.trimStart();
  const leadingWsLen = line.length - trimmed.length;
  const spans: TokenSpan[] = [];

  if (leadingWsLen > 0) {
    spans.push({
      text: line.slice(0, leadingWsLen),
      color: JSON_COLORS.whitespace.fg,
      bold: false,
    });
  }

  if (trimmed.length === 0) return spans;

  // // or /* comment */ style comments (non-standard JSON, but render them)
  if (
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("#")
  ) {
    spans.push({ text: trimmed, color: JSON_COLORS.comment.fg, bold: false });
    return spans;
  }

  // Braces/brackets at start
  if ("{]}[".includes(trimmed[0])) {
    spans.push({ text: trimmed[0], color: JSON_COLORS.brace.fg, bold: true });
    const rest = tokenizeJsonLine(trimmed.slice(1));
    spans.push(...rest);
    return spans;
  }

  // Trailing comma/brace
  if (
    trimmed.endsWith(",") ||
    trimmed.endsWith("{") ||
    trimmed.endsWith("}") ||
    trimmed.endsWith("[") ||
    trimmed.endsWith("]")
  ) {
    const last = trimmed[trimmed.length - 1];
    const prefix = trimmed.slice(0, -1);
    const prefixSpans = tokenizeJsonLine(prefix);
    spans.push(...prefixSpans);
    const isBrace = "{}[]".includes(last);
    spans.push({
      text: last,
      color: isBrace ? JSON_COLORS.brace.fg : JSON_COLORS.comma.fg,
      bold: isBrace,
    });
    return spans;
  }

  // "key": value pattern
  const keyMatch = trimmed.match(/^"([^"\\]|\\.)*"\s*:/);
  if (keyMatch) {
    const keyStr = keyMatch[0];
    spans.push({
      text: keyStr.slice(0, keyStr.indexOf(":")),
      color: JSON_COLORS.key.fg,
      bold: false,
    });
    spans.push({
      text: keyStr.slice(keyStr.indexOf(":")),
      color: JSON_COLORS.colon.fg,
      bold: false,
    });
    const rest = tokenizeJsonLine(trimmed.slice(keyMatch[0].length));
    spans.push(...rest);
    return spans;
  }

  // String value
  if (trimmed.startsWith('"')) {
    const endIdx = findStringEnd(trimmed, 0);
    if (endIdx !== -1) {
      spans.push({
        text: trimmed.slice(0, endIdx + 1),
        color: JSON_COLORS.string.fg,
        bold: false,
      });
      const rest = tokenizeJsonLine(trimmed.slice(endIdx + 1));
      spans.push(...rest);
    } else {
      spans.push({ text: trimmed, color: JSON_COLORS.string.fg, bold: false });
    }
    return spans;
  }

  // Number/boolean/null
  const wordMatch = trimmed.match(
    /^(-?\d+(\.\d+)?([eE][+-]?\d+)?|true|false|null)/
  );
  if (wordMatch) {
    const word = wordMatch[0];
    const color =
      word === "null"
        ? JSON_COLORS.null.fg
        : word === "true" || word === "false"
          ? JSON_COLORS.boolean.fg
          : JSON_COLORS.number.fg;
    spans.push({ text: word, color, bold: false });
    const rest = tokenizeJsonLine(trimmed.slice(word.length));
    spans.push(...rest);
    return spans;
  }

  // Fallback
  spans.push({ text: trimmed, color: JSON_COLORS.whitespace.fg, bold: false });
  return spans;
}

// ─── Low-level helpers ───────────────────────────────────────────────────────

/** Find the start of an inline comment in TOML (# not inside a string). */
function findCommentIndex(s: string): number {
  let inString: false | "'" | '"' = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (ch === "\\" && i + 1 < s.length) {
        i++;
        continue;
      }
      if (ch === inString) {
        inString = false;
        continue;
      }
    } else {
      if (ch === '"' || ch === "'") {
        inString = ch as "'" | '"';
        continue;
      }
      if (ch === "#") return i;
    }
  }
  return -1;
}

/** Find the end of a JSON string starting at idx (handles \"). */
function findStringEnd(s: string, startIdx: number): number {
  const quote = s[startIdx];
  for (let i = startIdx + 1; i < s.length; i++) {
    if (s[i] === "\\" && i + 1 < s.length) {
      i++;
      continue;
    }
    if (s[i] === quote) return i;
  }
  return -1;
}

/** Detect file type from path extension. */
export function detectFileType(path: string): FileType {
  const name = path.toLowerCase();
  if (name.endsWith(".toml")) return "toml";
  if (name.endsWith(".json")) return "json";
  if (name.endsWith(".env") || name.startsWith(".")) return "env";
  return "unknown";
}

/** Tokenize a line based on file type. */
function tokenizeLine(
  line: string,
  fileType: FileType,
  _lineNum: number,
  _syntaxErrors: SyntaxErrorEntry[]
): TokenSpan[] {
  if (fileType === "toml" || fileType === "env") {
    return tokenizeTomlLine(line);
  }
  if (fileType === "json") {
    return tokenizeJsonLine(line);
  }
  return [{ text: line, color: Colors.foreground, bold: false }];
}

// ─── Syntax Validation ───────────────────────────────────────────────────────

/**
 * Map a smol-toml parser error to our SyntaxErrorEntry shape.
 * Falls back to a generic 1/0 entry if the error is not a TomlError.
 */
function tomlErrorToEntry(err: unknown): SyntaxErrorEntry {
  if (err instanceof TomlError) {
    return {
      line: err.line,
      column: err.column,
      message: err.message,
    };
  }
  const msg = err instanceof Error ? err.message : String(err);
  return {
    line: 1,
    column: 0,
    message: `TOML parser error: ${msg}`,
  };
}

/**
 * Validate TOML or JSON syntax and return an array of errors.
 * For JSON: uses JSON.parse with detailed error extraction.
 * For TOML: uses smol-toml (full TOML 1.1.0 parser) for accurate
 *   line/column errors. Multi-line strings, arrays, inline tables
 *   and every other TOML construct are handled by the parser — no
 *   hand-rolled bracket counting.
 */
export function validateSyntax(
  content: string,
  fileType: FileType
): SyntaxErrorEntry[] {
  const errors: SyntaxErrorEntry[] = [];

  if (fileType === "json") {
    try {
      JSON.parse(content);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Try to extract line/column from parser error
      const lineMatch = msg.match(/line\s+(\d+)/i);
      const colMatch =
        msg.match(/column\s+(\d+)/i) ?? msg.match(/position\s+(\d+)/i);
      errors.push({
        line: lineMatch ? parseInt(lineMatch[1]) : 1,
        column: colMatch ? parseInt(colMatch[1]) : 0,
        message: msg,
      });
    }
  }

  if (fileType === "toml") {
    try {
      // smol-toml is a full TOML 1.1.0 parser — supports multi-line
      // strings ("""..."""), literal strings, arrays, inline tables,
      // arrays of tables, dotted keys, dates/times, etc. Throws
      // TomlError on the first invalid construct with 1-based
      // line/column and a descriptive message.
      parseToml(content);
    } catch (e) {
      errors.push(tomlErrorToEntry(e));
    }
  }

  return errors;
}

/** Format TOML content (basic: normalize whitespace, sort sections). */
export function formatContent(content: string, fileType: FileType): string {
  if (fileType === "json") {
    try {
      const parsed = JSON.parse(content);
      return JSON.stringify(parsed, null, 2) + "\n";
    } catch {
      // If invalid JSON, return as-is
      return content;
    }
  }
  // For TOML: trim trailing whitespace, ensure single trailing newline
  return (
    content
      .split("\n")
      .map((l) => l.trimEnd())
      .join("\n")
      .trimEnd() + "\n"
  );
}

// ─── CodeEditor Component ────────────────────────────────────────────────────

interface CodeEditorProps {
  content: string;
  fileType: FileType;
  fileName: string | null;
  syntaxErrors: SyntaxErrorEntry[];
  scrollOffset: number;
}

export function CodeEditor({
  content,
  fileType,
  fileName,
  syntaxErrors,
  scrollOffset: _scrollOffset,
}: CodeEditorProps) {
  const lines = useMemo(() => content.split("\n"), [content]);

  // Build a set of error line numbers for inline highlighting
  const errorLineSet = useMemo(() => {
    const set = new Set<number>();
    for (const err of syntaxErrors) set.add(err.line);
    return set;
  }, [syntaxErrors]);

  // Compute visible lines based on scroll offset
  const maxLineWidth = String(lines.length).length;
  const paddingLeft = maxLineWidth + 3; // " N │ "

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
      {/* Header — file name (view-first: free typing not supported) */}
      <box paddingLeft={1} paddingRight={1} paddingTop={0} paddingBottom={0}>
        <text fg={Colors.foreground}>
          {fileName ? `Viewing: ${fileName}` : "No file selected"}
        </text>
      </box>

      <text fg={Colors.border} dim>
        {"─".repeat(60)}
      </text>

      {/* Editor content with line numbers */}
      {fileName ? (
        <scrollbox width="100%" flexGrow={1} border={false}>
          {lines.length === 0 ? (
            <text fg={Colors.muted} dim>
              {" ".repeat(paddingLeft)}Empty file
            </text>
          ) : (
            lines.map((line, idx) => {
              const lineNum = idx + 1;
              const lineNumStr = String(lineNum).padStart(maxLineWidth);
              const hasError = errorLineSet.has(lineNum);
              const tokens = tokenizeLine(line, fileType, lineNum, []);

              return (
                <box key={idx} flexDirection="row" gap={0}>
                  {/* Line number */}
                  <text
                    fg={hasError ? Colors.error : Colors.muted}
                    dim={!hasError}
                  >
                    {lineNumStr}
                  </text>
                  {/* Separator */}
                  <text fg={Colors.border} dim>
                    {" │ "}
                  </text>
                  {/* Tokenized line content */}
                  <text fg={Colors.foreground}>
                    {tokens.map((span, si) => (
                      <span key={si} fg={span.color}>
                        {span.text}
                      </span>
                    ))}
                  </text>
                  {/* Error indicator */}
                  {hasError && (
                    <text fg={Colors.error} bold>
                      {"  ←"}
                    </text>
                  )}
                </box>
              );
            })
          )}
        </scrollbox>
      ) : (
        <box flexDirection="column" flexGrow={1} padding={2} gap={1}>
          <text fg={Colors.muted} dim>
            Select a file from the tree to view (Format / Save available)
          </text>
          <text fg={Colors.dim} dim>
            ↑↓ navigate · Enter select · Tab switch pane
          </text>
        </box>
      )}

      {/* Syntax error summary */}
      {syntaxErrors.length > 0 && (
        <box flexDirection="column" paddingTop={0} paddingLeft={1}>
          <text fg={Colors.error} bold>
            ⚠ {syntaxErrors.length} syntax error
            {syntaxErrors.length > 1 ? "s" : ""}:
          </text>
          {syntaxErrors.slice(0, 3).map((err, i) => (
            <text key={i} fg={Colors.error}>
              Ln {err.line}, Col {err.column}: {err.message}
            </text>
          ))}
          {syntaxErrors.length > 3 && (
            <text fg={Colors.muted} dim>
              ... and {syntaxErrors.length - 3} more
            </text>
          )}
        </box>
      )}
    </box>
  );
}
