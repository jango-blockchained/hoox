/** @jsxImportSource @opentui/react */
import { describe, it, expect } from "bun:test";
import { Colors } from "@jango-blockchained/hoox-shared";
import {
  tokenizeTomlLine,
  tokenizeJsonLine,
  detectFileType,
  validateSyntax,
  formatContent,
  flattenTree,
  CONFIG_TREE_BLUEPRINT,
  resolveConfigDir,
  resolveConfigFilePath,
  resetResolvedConfigDir,
} from "./config-editor";
import type { FileNode } from "./config-editor";

describe("ConfigEditor", () => {
  // ─── Path resolution (no double config/config) ─────────────────────────

  describe("resolveConfigFilePath", () => {
    it("does not double-prefix config/ under a project root", () => {
      resetResolvedConfigDir();
      const root = resolveConfigDir();
      const full = resolveConfigFilePath("config/wrangler.toml");
      expect(full).not.toContain("config/config/");
      expect(
        full.endsWith("config/wrangler.toml") ||
          full.endsWith("config\\wrangler.toml")
      ).toBe(true);
      // Root should not itself be the config directory when blueprint uses config/…
      if (root.endsWith("/config") || root.endsWith("\\config")) {
        // If root is config dir, relative paths must strip config/ — covered above
        expect(full.includes(`${root}/config/`)).toBe(false);
      }
    });
  });

  // ─── Tree Structure Tests ──────────────────────────────────────────────

  describe("CONFIG_TREE_BLUEPRINT", () => {
    it("has config directory as root", async () => {
      expect(CONFIG_TREE_BLUEPRINT.length).toBeGreaterThan(0);
      expect(CONFIG_TREE_BLUEPRINT[0].name).toBe("config");
      expect(CONFIG_TREE_BLUEPRINT[0].type).toBe("directory");
    });

    it("contains all 5 top-level entries in config/", async () => {
      const children = CONFIG_TREE_BLUEPRINT[0].children!;
      expect(children.length).toBe(5); // wrangler.toml, trade.config.json, risk.config.json, strategies, .env
    });

    it("strategies directory has 3 config files", async () => {
      const strategies = CONFIG_TREE_BLUEPRINT[0].children!.find(
        (c) => c.name === "strategies"
      );
      expect(strategies).toBeDefined();
      expect(strategies!.children!.length).toBe(3);
      const names = strategies!.children!.map((c) => c.name);
      expect(names).toContain("grid.config.json");
      expect(names).toContain("macd.config.json");
      expect(names).toContain("scalping.config.json");
    });
  });

  // ─── flattenTree Tests ─────────────────────────────────────────────────

  describe("flattenTree", () => {
    it("flattens directory tree with levels", async () => {
      const nodes: FileNode[] = [
        {
          name: "dir",
          path: "dir",
          type: "directory",
          children: [{ name: "file.txt", path: "dir/file.txt", type: "file" }],
        },
      ];
      const flat = flattenTree(nodes);
      expect(flat.length).toBe(2); // directory + file
      expect(flat[0].node.name).toBe("dir");
      expect(flat[0].level).toBe(0);
      expect(flat[1].node.name).toBe("file.txt");
      expect(flat[1].level).toBe(1);
    });

    it("returns empty array for empty input", async () => {
      expect(flattenTree([])).toEqual([]);
    });
  });

  // ─── detectFileType Tests ──────────────────────────────────────────────

  describe("detectFileType", () => {
    it("detects TOML files", async () => {
      expect(detectFileType("config/wrangler.toml")).toBe("toml");
      expect(detectFileType("config/settings.TOML")).toBe("toml");
    });

    it("detects JSON files", async () => {
      expect(detectFileType("config/trade.config.json")).toBe("json");
      expect(detectFileType("risk.config.json")).toBe("json");
    });

    it("detects .env files", async () => {
      expect(detectFileType("config/.env")).toBe("env");
      expect(detectFileType(".env.local")).toBe("env");
    });

    it("returns unknown for other extensions", async () => {
      expect(detectFileType("config/notes.txt")).toBe("unknown");
      expect(detectFileType("config/data.yaml")).toBe("unknown");
    });
  });

  // ─── TOML Syntax Highlighting Tests ────────────────────────────────────

  describe("tokenizeTomlLine", () => {
    it("highlights full-line comments as muted", async () => {
      const tokens = tokenizeTomlLine("# this is a comment");
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[0].text).toContain("#");
      expect(tokens[0].color).toBe(Colors.muted);
    });

    it("highlights section headers as accent bold", async () => {
      const tokens = tokenizeTomlLine("[env.production]");
      const sectionToken = tokens.find((t) => t.text.includes("["));
      expect(sectionToken).toBeDefined();
      expect(sectionToken!.color).toBe(Colors.accent);
      expect(sectionToken!.bold).toBe(true);
    });

    it("highlights key values with accent color", async () => {
      const tokens = tokenizeTomlLine('name = "hoox"');
      const keyToken = tokens.find((t) => t.text.trim() === "name");
      expect(keyToken).toBeDefined();
      expect(keyToken!.color).toBe(Colors.accent);
    });

    it("highlights string values with info color", async () => {
      const tokens = tokenizeTomlLine('url = "https://example.com"');
      const stringToken = tokens.find((t) => t.text.includes('"'));
      expect(stringToken).toBeDefined();
      expect(stringToken!.color).toBe(Colors.info);
    });

    it("highlights boolean values with info color", async () => {
      const tokens = tokenizeTomlLine("enabled = true");
      const boolToken = tokens.find((t) => t.text.trim() === "true");
      expect(boolToken).toBeDefined();
      expect(boolToken!.color).toBe(Colors.info);
    });

    it("handles empty lines", async () => {
      const tokens = tokenizeTomlLine("");
      expect(tokens.length).toBe(0);
    });

    it("handles inline trailing comments", async () => {
      const tokens = tokenizeTomlLine('name = "value" # trailing comment');
      const commentToken = tokens.find((t) => t.text.includes("#"));
      expect(commentToken).toBeDefined();
      expect(commentToken!.color).toBe(Colors.muted);
    });
  });

  // ─── JSON Syntax Highlighting Tests ────────────────────────────────────

  describe("tokenizeJsonLine", () => {
    it("highlights JSON keys with accent color", async () => {
      const tokens = tokenizeJsonLine('  "name": "value",');
      const keyToken = tokens.find((t) => t.text.includes("name"));
      expect(keyToken).toBeDefined();
      expect(keyToken!.color).toBe(Colors.accent);
    });

    it("highlights JSON string values with info color", async () => {
      const tokens = tokenizeJsonLine('  "key": "hello world"');
      const valToken = tokens.find((t) => t.text.includes("hello"));
      expect(valToken).toBeDefined();
      expect(valToken!.color).toBe(Colors.info);
    });

    it("highlights JSON numbers with foreground color", async () => {
      const tokens = tokenizeJsonLine('  "count": 42');
      const numToken = tokens.find((t) => t.text.trim() === "42");
      expect(numToken).toBeDefined();
      expect(numToken!.color).toBe(Colors.foreground);
    });

    it("highlights JSON null with muted color", async () => {
      const tokens = tokenizeJsonLine('  "data": null');
      const nullToken = tokens.find((t) => t.text.trim() === "null");
      expect(nullToken).toBeDefined();
      expect(nullToken!.color).toBe(Colors.muted);
    });

    it("highlights JSON booleans with info color", async () => {
      const tokens = tokenizeJsonLine('  "active": true');
      const boolToken = tokens.find((t) => t.text.trim() === "true");
      expect(boolToken).toBeDefined();
      expect(boolToken!.color).toBe(Colors.info);
    });

    it("handles nested braces", async () => {
      const tokens = tokenizeJsonLine('{ "key": { "nested": 1 } }');
      // Should not crash
      expect(tokens.length).toBeGreaterThan(0);
    });
  });

  // ─── Syntax Validation Tests ───────────────────────────────────────────

  describe("validateSyntax", () => {
    it("returns no errors for valid JSON", async () => {
      const errors = validateSyntax('{"valid": "json", "num": 42}', "json");
      expect(errors.length).toBe(0);
    });

    it("returns errors for invalid JSON", async () => {
      const errors = validateSyntax('{"broken": invalid}', "json");
      expect(errors.length).toBeGreaterThan(0);
    });

    it("returns errors for JSON with trailing comma", async () => {
      const errors = validateSyntax('{"key": "value",}', "json");
      expect(errors.length).toBeGreaterThan(0);
    });

    it("returns no errors for well-formed TOML", async () => {
      const errors = validateSyntax('[section]\nkey = "value"\n', "toml");
      expect(errors.length).toBe(0);
    });

    it("returns errors for TOML with unbalanced brackets", async () => {
      const errors = validateSyntax("[section\nkey = value\n", "toml");
      expect(errors.length).toBeGreaterThan(0);
    });

    it("returns errors for TOML with unbalanced quotes", async () => {
      const errors = validateSyntax('key = "unclosed string\n', "toml");
      expect(errors.length).toBeGreaterThan(0);
    });

    // ─── Real TOML parser integration ────────────────────────────────

    it("parses multi-line literal strings (''' ... ''')", async () => {
      const toml = [
        "[post]",
        "title = '''",
        "First line",
        "Second line",
        "'''",
        "",
      ].join("\n");
      const errors = validateSyntax(toml, "toml");
      expect(errors.length).toBe(0);
    });

    it('parses multi-line basic strings (""" ... """)', async () => {
      const toml = [
        "[post]",
        'description = """',
        "Line one",
        'Line two with "quotes"',
        '"""',
        "",
      ].join("\n");
      const errors = validateSyntax(toml, "toml");
      expect(errors.length).toBe(0);
    });

    it('parses inline tables ({ key = "value" })', async () => {
      const toml = [
        "[servers]",
        'alpha = { ip = "10.0.0.1", port = 8000 }',
        'beta = { ip = "10.0.0.2", port = 8001, enabled = true }',
        "",
      ].join("\n");
      const errors = validateSyntax(toml, "toml");
      expect(errors.length).toBe(0);
    });

    it("parses arrays of tables ([[name]])", async () => {
      const toml = [
        "[[fruits]]",
        'name = "apple"',
        "",
        "[[fruits]]",
        'name = "banana"',
        "",
      ].join("\n");
      const errors = validateSyntax(toml, "toml");
      expect(errors.length).toBe(0);
    });

    it("parses arrays with mixed primitive types", async () => {
      const toml = [
        "[data]",
        "ints = [1, 2, 3]",
        'strings = ["a", "b", "c"]',
        "nested = [[1, 2], [3, 4]]",
        "",
      ].join("\n");
      const errors = validateSyntax(toml, "toml");
      expect(errors.length).toBe(0);
    });

    it("parses dotted keys (a.b.c = value)", async () => {
      const toml = 'physical.color = "orange"\nphysical.shape = "round"\n';
      const errors = validateSyntax(toml, "toml");
      expect(errors.length).toBe(0);
    });

    it("reports accurate line numbers for invalid TOML", async () => {
      // Line 1 valid, Line 2 valid, Line 3 has the error
      const toml = [
        "[section]",
        'key1 = "ok"',
        'key2 = "unclosed',
        'key3 = "fine"',
        "",
      ].join("\n");
      const errors = validateSyntax(toml, "toml");
      expect(errors.length).toBeGreaterThan(0);
      // smol-toml's TomlError is 1-based. The error originates on
      // line 3 (unclosed string); the parser may point to the same
      // line or to the first line where it becomes unrecoverable.
      // Either way, the error must NOT be on a known-valid line.
      expect(errors[0].line).toBeGreaterThanOrEqual(3);
      expect(errors[0].line).toBeLessThanOrEqual(4);
    });

    it("reports 1-based column for invalid TOML", async () => {
      const toml = 'key = "ok"\nbad = = "invalid"\n';
      const errors = validateSyntax(toml, "toml");
      expect(errors.length).toBeGreaterThan(0);
      // Column must be at least 1 (1-based) for a useful error marker.
      expect(errors[0].column).toBeGreaterThanOrEqual(1);
    });

    it("includes the parser's error message verbatim", async () => {
      const toml = 'key = = "invalid"\n';
      const errors = validateSyntax(toml, "toml");
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message.length).toBeGreaterThan(0);
      // Must not be the old generic "Unbalanced brackets" message.
      expect(errors[0].message).not.toMatch(/unbalanced/i);
    });

    it("returns empty errors for empty TOML", async () => {
      const errors = validateSyntax("", "toml");
      expect(errors.length).toBe(0);
    });

    it("handles TOML with only comments", async () => {
      const toml = "# just a comment\n# another one\n";
      const errors = validateSyntax(toml, "toml");
      expect(errors.length).toBe(0);
    });

    it("parses 10KB of TOML in under 100ms", async () => {
      // Build a 10KB TOML document with many keys.
      const lines: string[] = ["[big]"];
      let i = 0;
      while (lines.join("\n").length < 10_000) {
        lines.push(`key_${i} = "value_${i}"`);
        i++;
      }
      const toml = lines.join("\n") + "\n";

      const t0 = performance.now();
      const errors = validateSyntax(toml, "toml");
      const elapsed = performance.now() - t0;

      expect(errors.length).toBe(0);
      expect(elapsed).toBeLessThan(100);
    });
  });

  // ─── Format Content Tests ──────────────────────────────────────────────

  describe("formatContent", () => {
    it("formats valid JSON with indentation", async () => {
      const unformatted = '{"key":"value","num":42}';
      const formatted = formatContent(unformatted, "json");
      expect(formatted).toContain("\n");
      expect(formatted).toContain('"key"');
      expect(formatted).toContain('"value"');
    });

    it("returns unchanged content for invalid JSON", async () => {
      const invalid = '{"broken": invalid}';
      const formatted = formatContent(invalid, "json");
      expect(formatted).toBe(invalid);
    });

    it("trims trailing whitespace in TOML", async () => {
      const withSpaces = "key = value   \n  [section]   \n";
      const formatted = formatContent(withSpaces, "toml");
      expect(formatted).not.toMatch(/ {2}\n/);
      expect(formatted.endsWith("\n")).toBe(true);
    });
  });
});
