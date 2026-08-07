#!/usr/bin/env bun
/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Hoox Monorepo Function & Relationship Graph Extractor
 *
 * Parses the entire monorepo TypeScript AST using ts-morph,
 * producing a machine-readable JSON graph and a visual DOT graph
 * for developer visualization and AI context querying.
 *
 * Usage: bun scripts/extract-graph.ts
 * Output: graph.json, graph.dot in repo root
 */

import {
  readFileSync,
  readdirSync,
  existsSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { join, relative, extname, sep } from "node:path";
import { Project, SyntaxKind, type Node } from "ts-morph";

// ─── Types ───────────────────────────────────────────────────────────────

type NodeKind =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "const"
  | "enum"
  | "variable"
  | "worker"
  | "package"
  | "infrastructure";

type EdgeKind =
  | "imports"
  | "calls"
  | "extends"
  | "implements"
  | "references"
  | "service-binding"
  | "workspace-dep"
  | "infra-binding"
  | "data-flow";

interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
  filePath: string;
  workspace: string;
  exports: string[];
  isEntryPoint?: boolean;
  // Architecture layer fields (added by enhanceWithArchitectureLayer)
  description?: string;
  category?: string;
  tags?: string[];
  llmContext?: string;
  cron?: string | null;
  isPublic?: boolean;
  smartPlacement?: boolean;
  entryPoint?: string;
  bindingName?: string;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  label?: string;
  description?: string;
}

interface Graph {
  metadata: {
    generatedAt: string;
    workspace: string;
    totalFiles: number;
    totalNodes: number;
    totalEdges: number;
    nodeKinds: Record<string, number>;
    edgeKinds: Record<string, number>;
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface WorkspaceInfo {
  name: string;
  relativePath: string; // e.g., "packages/shared"
  type: "package" | "worker" | "page";
  hasSrc: boolean;
  hasApp: boolean; // Next.js app dir
}

// ─── Configuration ───────────────────────────────────────────────────────

const ROOT = process.cwd();
const OUTPUT_JSON = join(ROOT, "graph.json");
const OUTPUT_DOT = join(ROOT, "graph.dot");
const OUTPUT_METADATA = join(ROOT, "graph-metadata.json");

// Workspace colors for DOT output
const WORKSPACE_COLORS: Record<
  string,
  { fill: string; border: string; font: string }
> = {
  "packages/shared": { fill: "#e1f0fa", border: "#4A90D9", font: "#1a3a5c" },
  "packages/cli": { fill: "#d4f5f5", border: "#00B4B4", font: "#004d4d" },
  "packages/tui": { fill: "#d4faf0", border: "#00BCD4", font: "#004d5c" },
  "workers/hoox-worker": {
    fill: "#e8f5e9",
    border: "#4CAF50",
    font: "#1b5e20",
  },
  "workers/trade-worker": {
    fill: "#f1f8e9",
    border: "#8BC34A",
    font: "#33691e",
  },
  "workers/agent-worker": {
    fill: "#e0f2f1",
    border: "#009688",
    font: "#004d40",
  },
  "workers/d1-worker": { fill: "#e0f7fa", border: "#00ACC1", font: "#004d5c" },
  "workers/telegram-worker": {
    fill: "#e3f2fd",
    border: "#2196F3",
    font: "#0d47a1",
  },
  "workers/web3-wallet-worker": {
    fill: "#ede7f6",
    border: "#673AB7",
    font: "#311b92",
  },
  "workers/email-worker": {
    fill: "#fce4ec",
    border: "#E91E63",
    font: "#880e4f",
  },
  "workers/analytics-worker": {
    fill: "#fff3e0",
    border: "#FF9800",
    font: "#e65100",
  },
  "workers/report-worker": {
    fill: "#efebe9",
    border: "#795548",
    font: "#3e2723",
  },
  "workers/pyne-worker": {
    fill: "#e0f7fa",
    border: "#00ACC1",
    font: "#006064",
  },
  "workers/dashboard": { fill: "#ffebee", border: "#F44336", font: "#b71c1c" },
  "pages/docs": { fill: "#fff8e1", border: "#FFB300", font: "#4a3c00" },
};

const DEFAULT_COLOR = { fill: "#f5f5f5", border: "#9e9e9e", font: "#212121" };

// Directories to exclude from scanning
const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".next",
  ".wrangler",
  "dist",
  "build",
  ".open-next",
  "coverage",
  ".git",
  "test",
  "tests",
  "__tests__",
  "__snapshots__",
  "mocks",
]);

// ─── Workspace Discovery ─────────────────────────────────────────────────

function discoverWorkspaces(): WorkspaceInfo[] {
  const rootPkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
  const workspacePatterns: string[] = rootPkg.workspaces || [];

  const workspaces: WorkspaceInfo[] = [];

  for (const pattern of workspacePatterns) {
    // Expand glob patterns like "packages/*", "workers/*", "pages/*"
    const parts = pattern.split("/");
    const globDir = parts[0]; // e.g., "packages"

    if (!existsSync(join(ROOT, globDir))) continue;

    // Determine type from directory name
    const type =
      globDir === "packages"
        ? "package"
        : globDir === "workers"
          ? "worker"
          : "page";

    if (pattern.includes("*")) {
      // Glob pattern - scan subdirectories
      const entries = readdirSync(join(ROOT, globDir)).sort();
      for (const entry of entries) {
        const fullPath = join(ROOT, globDir, entry);
        const pkgPath = join(fullPath, "package.json");
        if (statSync(fullPath).isDirectory() && existsSync(pkgPath)) {
          const relPath = `${globDir}/${entry}`;
          workspaces.push({
            name: relPath,
            relativePath: relPath,
            type,
            hasSrc: existsSync(join(fullPath, "src")),
            hasApp: existsSync(join(fullPath, "app")),
          });
        }
      }
    } else {
      // Literal path
      const pkgPath = join(ROOT, pattern, "package.json");
      if (existsSync(pkgPath)) {
        workspaces.push({
          name: pattern,
          relativePath: pattern,
          type,
          hasSrc: existsSync(join(ROOT, pattern, "src")),
          hasApp: existsSync(join(ROOT, pattern, "app")),
        });
      }
    }
  }

  return workspaces;
}

/**
 * Strips JSONC comments (// and /* * /) from a string so it can be parsed as JSON.
 * Handles strings properly so comments inside strings are preserved.
 * Also removes trailing commas for strict JSON parsers.
 */
function stripJsoncComments(text: string): string {
  let result = "";
  let i = 0;
  let inString = false;
  let stringChar = "";
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      if (ch === "\\" && next) {
        result += ch + next;
        i += 2;
        continue;
      }
      result += ch;
      if (ch === stringChar) inString = false;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = true;
      stringChar = ch;
      result += ch;
      i++;
      continue;
    }
    if (ch === "/" && next === "/") {
      // Single-line comment: skip to end of line
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      // Multi-line comment: skip to */
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2; // skip */
      continue;
    }
    result += ch;
    i++;
  }
  // Remove trailing commas before closing braces/brackets (handles JSONC patterns)
  result = result.replace(/,(\s*[}\]])/g, "$1");
  return result;
}

function getWorkspaceColor(workspace: string) {
  return WORKSPACE_COLORS[workspace] || DEFAULT_COLOR;
}

function escapeDOTId(id: string): string {
  // DOT IDs with special chars need quoting
  return `"${id.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// ─── Progress Bar ─────────────────────────────────────────────────────────

class ProgressBar {
  private total: number;
  private current: number;
  private phaseStart: number;
  private totalStart: number;

  constructor(total: number) {
    this.total = total;
    this.current = 0;
    this.phaseStart = performance.now();
    this.totalStart = performance.now();
  }

  tick(_label: string): void {
    this.current++;
    const pct = Math.min(100, Math.round((this.current / this.total) * 100));
    const elapsed = ((performance.now() - this.phaseStart) / 1000).toFixed(1);
    const barWidth = 20;
    const filled = Math.floor((pct / 100) * barWidth);
    const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
    process.stderr.write(
      `\r  [${bar}] ${pct.toString().padStart(2)}%  ${_label.padEnd(32)} ${elapsed.padStart(6)}s`
    );
    this.phaseStart = performance.now();
  }

  finish(): void {
    const total = ((performance.now() - this.totalStart) / 1000).toFixed(1);
    process.stderr.write(
      `\r  [${"█".repeat(20)}] 100%  Done${" ".repeat(28)}${total.padStart(6)}s\n`
    );
  }

  totalTime(): string {
    return ((performance.now() - this.totalStart) / 1000).toFixed(1);
  }
}

// ─── AST Graph Extraction ────────────────────────────────────────────────

function extractGraph(
  workspaces: WorkspaceInfo[],
  progress?: ProgressBar
): Graph {
  const graph: Graph = {
    metadata: {
      generatedAt: new Date().toISOString(),
      workspace: "hoox-monorepo",
      totalFiles: 0,
      totalNodes: 0,
      totalEdges: 0,
      nodeKinds: {},
      edgeKinds: {},
    },
    nodes: [],
    edges: [],
  };

  const nodes: Map<string, GraphNode> = new Map();
  const edges: Map<string, GraphEdge> = new Map();
  const fileToWorkspace: Map<string, string> = new Map();
  const fileToNodes: Map<string, string[]> = new Map(); // filePath -> node IDs
  const workspaceNodes: Map<string, string> = new Map(); // workspace -> node ID for the workspace node

  console.log("📦 Loading ts-morph project...");

  // Create ts-morph Project with root tsconfig (for path alias resolution)
  const project = new Project({
    tsConfigFilePath: join(ROOT, "tsconfig.json"),
    skipAddingFilesFromTsConfig: true,
  });

  // Add source files from each workspace
  let totalFiles = 0;
  for (const ws of workspaces) {
    const wsPath = join(ROOT, ws.relativePath);

    const walkDir = (dirPath: string) => {
      if (!existsSync(dirPath)) return;
      const entries = readdirSync(dirPath);
      for (const entry of entries) {
        if (EXCLUDE_DIRS.has(entry)) continue;
        if (entry.startsWith(".")) continue;
        const fullPath = join(dirPath, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          walkDir(fullPath);
        } else if (stat.isFile()) {
          const ext = extname(entry);
          if (ext === ".ts" || ext === ".tsx") {
            try {
              project.addSourceFileAtPath(fullPath);
              totalFiles++;
            } catch (err) {
              // Skip files that can't be parsed
              console.warn(
                `  ⚠️  Skipping unparseable file: ${relative(ROOT, fullPath)}`
              );
            }
          }
        }
      }
    };

    if (ws.hasSrc) walkDir(join(wsPath, "src"));
    if (ws.hasApp) walkDir(join(wsPath, "app"));

    // Also add any top-level .ts/.tsx files in the worker root (e.g., worker config files, index)
    walkDir(wsPath);
  }

  graph.metadata.totalFiles = totalFiles;
  console.log(
    `  Loaded ${totalFiles} source files across ${workspaces.length} workspaces`
  );

  // Build full TypeScript program for TypeChecker resolution
  console.log("  Resolving source file dependencies...");
  project.resolveSourceFileDependencies();

  // Build file -> workspace mapping
  const wsPaths = workspaces.map((w) => ({
    prefix: join(ROOT, w.relativePath) + sep,
    ws: w.relativePath,
  }));

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    for (const { prefix, ws } of wsPaths) {
      if (filePath.startsWith(prefix)) {
        fileToWorkspace.set(filePath, ws);
        break;
      }
    }
  }

  // ─── Step 1: Extract exported declarations → nodes ─────────────────

  console.log("🔍 Extracting exported declarations...");
  let nodeCount = 0;

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    const workspace = fileToWorkspace.get(filePath);
    if (!workspace) continue;

    // Get relative file path for display
    const relPath = relative(ROOT, filePath);

    // Get all exported declarations
    // getExportedDeclarations() returns Map<string, Declaration[]>
    // where the key is the export name
    const exportedDecls = sourceFile.getExportedDeclarations();

    if (exportedDecls.size === 0) continue;

    const fileNodeIds: string[] = [];

    for (const [exportName, decls] of exportedDecls) {
      for (const decl of decls) {
        const kind = getNodeKind(decl);
        if (!kind) continue;

        const nodeId = `${workspace}:${relPath}:${exportName}`;

        // Skip duplicates (multiple exports with same name from same file)
        if (nodes.has(nodeId)) {
          // Add this export name to the existing node
          const existing = nodes.get(nodeId)!;
          if (!existing.exports.includes(exportName)) {
            existing.exports.push(exportName);
          }
          continue;
        }

        const node: GraphNode = {
          id: nodeId,
          label: exportName,
          kind,
          filePath: relPath,
          workspace,
          exports: [exportName],
          isEntryPoint: isEntryPointFile(relPath),
        };

        nodes.set(nodeId, node);
        fileNodeIds.push(nodeId);
        nodeCount++;

        // Track node kind counts
        graph.metadata.nodeKinds[kind] =
          (graph.metadata.nodeKinds[kind] || 0) + 1;
      }
    }

    if (fileNodeIds.length > 0) {
      fileToNodes.set(filePath, fileNodeIds);
    }
  }

  progress?.tick(`exports: ${nodeCount} nodes`);

  // ─── Step 2: Extract import edges ──────────────────────────────────

  console.log("🔍 Extracting import relationships...");

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    const sourceWorkspace = fileToWorkspace.get(filePath);
    if (!sourceWorkspace) continue;

    const sourceNodes = fileToNodes.get(filePath);
    if (!sourceNodes || sourceNodes.length === 0) continue;

    const imports = sourceFile.getImportDeclarations();

    for (const importDecl of imports) {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();

      // Skip external imports
      if (!isInternalImport(moduleSpecifier)) continue;

      // Try to resolve the import to a source file
      const resolvedFile = importDecl.getModuleSpecifierSourceFile();
      if (!resolvedFile) continue;

      const resolvedPath = resolvedFile.getFilePath();
      const targetNodes = fileToNodes.get(resolvedPath);
      if (!targetNodes || targetNodes.length === 0) continue;

      // Process named imports: import { foo, bar } from "..."
      const namedImports = importDecl.getNamedImports();
      for (const namedImport of namedImports) {
        const importedName = namedImport.getName();
        // Find matching node in the target file
        const targetNode = targetNodes.find((nid) => {
          const node = nodes.get(nid);
          return node && node.exports.includes(importedName);
        });
        if (targetNode) {
          // Create import edges from each source node to this target
          for (const sourceNodeId of sourceNodes) {
            const edge = createEdge(
              sourceNodeId,
              targetNode,
              "imports",
              importedName,
              edges
            );
            if (edge) {
              graph.metadata.edgeKinds.imports =
                (graph.metadata.edgeKinds.imports || 0) + 1;
            }
          }
        }
      }

      // Process default import: import foo from "..."
      const defaultImport = importDecl.getDefaultImport();
      if (defaultImport) {
        const defaultName = defaultImport.getText();
        const targetNode = targetNodes.find((nid) => {
          const node = nodes.get(nid);
          return node && node.exports.includes("default");
        });
        if (targetNode) {
          for (const sourceNodeId of sourceNodes) {
            const edge = createEdge(
              sourceNodeId,
              targetNode,
              "imports",
              defaultName,
              edges
            );
            if (edge) {
              graph.metadata.edgeKinds.imports =
                (graph.metadata.edgeKinds.imports || 0) + 1;
            }
          }
        }
      }

      // Process namespace import: import * as foo from "..."
      const namespaceImport = importDecl.getNamespaceImport();
      if (namespaceImport) {
        const namespaceName = namespaceImport.getText();
        // Create edges to ALL exported nodes from the target file
        for (const targetNodeId of targetNodes) {
          for (const sourceNodeId of sourceNodes) {
            const edge = createEdge(
              sourceNodeId,
              targetNodeId,
              "imports",
              `${namespaceName}.${nodes.get(targetNodeId)?.label}`,
              edges
            );
            if (edge) {
              graph.metadata.edgeKinds.imports =
                (graph.metadata.edgeKinds.imports || 0) + 1;
            }
          }
        }
      }
    }
  }

  progress?.tick(`imports: ${graph.metadata.edgeKinds.imports || 0} edges`);

  // ─── Step 3: Extract extends/implements edges ──────────────────────

  console.log("🔍 Extracting class/interface relationships...");

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    const workspace = fileToWorkspace.get(filePath);
    if (!workspace) continue;

    const sourceNodes = fileToNodes.get(filePath);
    if (!sourceNodes || sourceNodes.length === 0) continue;

    // Class declarations with heritage clauses
    const classes = sourceFile.getClasses();
    for (const cls of classes) {
      const className = cls.getName();
      if (!className) continue;

      const classNodeId = sourceNodes.find((nid) => {
        const node = nodes.get(nid);
        return node && node.exports.includes(className);
      });
      if (!classNodeId) continue;

      // Extends
      const extended = cls.getExtends();
      if (extended) {
        const targetNode = resolveTypeReference(
          extended.getText(),
          nodes,
          project
        );
        if (targetNode) {
          const edge = createEdge(
            classNodeId,
            targetNode,
            "extends",
            extended.getText(),
            edges
          );
          if (edge)
            graph.metadata.edgeKinds.extends =
              (graph.metadata.edgeKinds.extends || 0) + 1;
        }
      }

      // Implements
      const implemented = cls.getImplements();
      for (const impl of implemented) {
        const targetNode = resolveTypeReference(impl.getText(), nodes, project);
        if (targetNode) {
          const edge = createEdge(
            classNodeId,
            targetNode,
            "implements",
            impl.getText(),
            edges
          );
          if (edge)
            graph.metadata.edgeKinds.implements =
              (graph.metadata.edgeKinds.implements || 0) + 1;
        }
      }
    }

    // Interface declarations with heritage clauses
    const interfaces = sourceFile.getInterfaces();
    for (const iface of interfaces) {
      const ifaceName = iface.getName();
      const ifaceNodeId = sourceNodes.find((nid) => {
        const node = nodes.get(nid);
        return node && node.exports.includes(ifaceName);
      });
      if (!ifaceNodeId) continue;

      const heritageClauses = iface.getHeritageClauses();
      for (const clause of heritageClauses) {
        const kind =
          clause.getToken() === SyntaxKind.ExtendsKeyword
            ? "extends"
            : "implements";
        for (const typeExpr of clause.getTypeNodes()) {
          const typeName = typeExpr.getText();
          const targetNode = resolveTypeReference(typeName, nodes, project);
          if (targetNode) {
            const edge = createEdge(
              ifaceNodeId,
              targetNode,
              kind,
              typeName,
              edges
            );
            if (edge)
              graph.metadata.edgeKinds[kind] =
                (graph.metadata.edgeKinds[kind] || 0) + 1;
          }
        }
      }
    }
  }

  progress?.tick(
    `extends/implements: ${(graph.metadata.edgeKinds.extends || 0) + (graph.metadata.edgeKinds.implements || 0)} edges`
  );

  // ─── Step 4: Type reference edges ──────────────────────────────────

  console.log("🔍 Extracting type references...");

  // Extract type references from type annotations in function signatures, etc.
  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    const workspace = fileToWorkspace.get(filePath);
    if (!workspace) continue;

    const sourceNodes = fileToNodes.get(filePath);
    if (!sourceNodes || sourceNodes.length === 0) continue;

    // Type reference extraction from type annotations
    const typeRefs = sourceFile.getDescendantsOfKind(SyntaxKind.TypeReference);
    for (const typeRef of typeRefs) {
      const typeName = typeRef.getTypeName();
      const nameText = typeName.getText();

      // Skip primitive/built-in types
      if (isBuiltInType(nameText)) continue;

      const targetNode = resolveTypeReference(nameText, nodes, project);
      if (targetNode) {
        // This type is referenced from this file - add edges from source nodes
        for (const sourceNodeId of sourceNodes) {
          const edge = createEdge(
            sourceNodeId,
            targetNode,
            "references",
            nameText,
            edges
          );
          if (edge) {
            graph.metadata.edgeKinds.references =
              (graph.metadata.edgeKinds.references || 0) + 1;
          }
        }
      }
    }
  }

  progress?.tick(
    `type refs: ${graph.metadata.edgeKinds.references || 0} edges`
  );

  // ─── Step 5: Cross-file call expression edges ──────────────────────

  console.log("🔍 Extracting cross-file call expressions...");

  const typeChecker = project.getTypeChecker();
  let callEdgeCount = 0;

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    const workspace = fileToWorkspace.get(filePath);
    if (!workspace) continue;

    const sourceNodes = fileToNodes.get(filePath);
    if (!sourceNodes || sourceNodes.length === 0) continue;

    const callExpressions = sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression
    );

    for (const callExpr of callExpressions) {
      const expression = callExpr.getExpression();

      let symbol;
      try {
        if (expression.isKind(SyntaxKind.Identifier)) {
          symbol = typeChecker.getSymbolAtLocation(expression);
        } else if (expression.isKind(SyntaxKind.PropertyAccessExpression)) {
          symbol = typeChecker.getSymbolAtLocation(expression);
        }
      } catch {
        continue;
      }

      if (!symbol) continue;

      const declarations = symbol.getDeclarations();
      if (!declarations || declarations.length === 0) continue;

      for (const decl of declarations) {
        const declSourceFile = decl.getSourceFile();
        if (!declSourceFile) continue;

        const declFilePath = declSourceFile.getFilePath();

        if (declFilePath === filePath) continue;

        const targetNodes = fileToNodes.get(declFilePath);
        if (!targetNodes || targetNodes.length === 0) continue;

        const functionName = symbol.getName();

        // The TypeChecker symbol name might be a method on an exported class/interface.
        // We match the symbol against our top-level export nodes.
        // If this is a method call (e.g., router.post), symbol returns 'post'
        // which won't match a top-level export. So we fall back to creating
        // an edge from the calling file's symbol to the target file's container.
        const targetNode = targetNodes.find((nid) => {
          const node = nodes.get(nid);
          return node && node.exports.includes(functionName);
        });

        if (!targetNode) {
          // Fallback: match against the file-level nodes as "calls" target
          // This handles method calls, where the specific method doesn't have
          // its own top-level export node
          // For now, create an edge from source to the first target node
          // to indicate cross-file dependency
          const firstTarget = targetNodes[0];
          if (firstTarget) {
            for (const sourceNodeId of sourceNodes) {
              const edge = createEdge(
                sourceNodeId,
                firstTarget,
                "calls",
                functionName,
                edges
              );
              if (edge) {
                callEdgeCount++;
              }
            }
          }
        } else {
          for (const sourceNodeId of sourceNodes) {
            const edge = createEdge(
              sourceNodeId,
              targetNode,
              "calls",
              functionName,
              edges
            );
            if (edge) {
              callEdgeCount++;
            }
          }
        }
      }
    }
  }

  graph.metadata.edgeKinds.calls =
    (graph.metadata.edgeKinds.calls || 0) + callEdgeCount;
  progress?.tick(`calls: ${callEdgeCount} edges`);

  // ─── Step 6: Service binding edges from wrangler.jsonc ─────────────

  console.log("🔍 Extracting service bindings from wrangler configs...");

  // Ensure worker/package nodes exist
  for (const ws of workspaces) {
    if (!workspaceNodes.has(ws.relativePath)) {
      const wsNode: GraphNode = {
        id: `workspace:${ws.relativePath}`,
        label: ws.relativePath,
        kind: ws.type === "worker" ? "worker" : "package",
        filePath: ws.relativePath,
        workspace: ws.relativePath,
        exports: [],
      };
      nodes.set(wsNode.id, wsNode);
      workspaceNodes.set(ws.relativePath, wsNode.id);
      graph.metadata.nodeKinds[wsNode.kind] =
        (graph.metadata.nodeKinds[wsNode.kind] || 0) + 1;
    }
  }

  // Read service bindings dynamically from each worker's wrangler.jsonc
  for (const ws of workspaces) {
    if (ws.type !== "worker") continue;
    const wranglerPath = join(ROOT, ws.relativePath, "wrangler.jsonc");
    if (!existsSync(wranglerPath)) continue;

    try {
      const content = readFileSync(wranglerPath, "utf-8");
      const config = JSON.parse(stripJsoncComments(content));

      if (config.services && Array.isArray(config.services)) {
        for (const svc of config.services) {
          const targetName = svc.service;
          if (!targetName) continue;
          const targetWs = `workers/${targetName}`;
          const sourceNodeId = workspaceNodes.get(ws.relativePath);
          const targetNodeId = workspaceNodes.get(targetWs);
          if (!sourceNodeId || !targetNodeId) continue;

          const edgeId = `sb:${ws.relativePath}->${targetWs}`;
          if (!edges.has(edgeId)) {
            edges.set(edgeId, {
              id: edgeId,
              source: sourceNodeId,
              target: targetNodeId,
              kind: "service-binding",
              label: `service: ${targetWs}`,
            });
            graph.metadata.edgeKinds["service-binding"] =
              (graph.metadata.edgeKinds["service-binding"] || 0) + 1;
          }
        }
      }
    } catch (err) {
      console.warn(
        `  ⚠️  Failed to parse wrangler.jsonc for ${ws.relativePath}: ${err}`
      );
    }
  }

  progress?.tick(
    `service bindings: ${graph.metadata.edgeKinds["service-binding"] || 0} edges`
  );

  // ─── Step 7: Workspace dependency edges from package.json ──────────

  console.log("🔍 Extracting workspace dependency edges...");

  for (const ws of workspaces) {
    const pkgPath = join(ROOT, ws.relativePath, "package.json");
    if (!existsSync(pkgPath)) continue;

    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    for (const [depName, depVersion] of Object.entries(allDeps)) {
      // Check if it's a workspace dependency (workspace:* protocol)
      if (
        typeof depVersion === "string" &&
        depVersion.startsWith("workspace:")
      ) {
        // Resolve workspace name
        const resolvedWs = resolveWorkspaceDependency(depName, workspaces);
        if (resolvedWs) {
          const sourceNodeId = workspaceNodes.get(ws.relativePath);
          const targetNodeId = workspaceNodes.get(resolvedWs);
          if (sourceNodeId && targetNodeId) {
            const edgeId = `ws-dep:${ws.relativePath}->${resolvedWs}`;
            if (!edges.has(edgeId)) {
              edges.set(edgeId, {
                id: edgeId,
                source: sourceNodeId,
                target: targetNodeId,
                kind: "workspace-dep",
                label: depName,
              });
              graph.metadata.edgeKinds["workspace-dep"] =
                (graph.metadata.edgeKinds["workspace-dep"] || 0) + 1;
            }
          }
        }
      }
    }
  }

  progress?.tick(
    `workspace deps: ${graph.metadata.edgeKinds["workspace-dep"] || 0} edges`
  );

  // ─── Step 8: Filter isolated nodes ─────────────────────────────────

  console.log("🔍 Filtering isolated nodes...");

  // Collect nodes that have at least one edge
  const connectedNodes = new Set<string>();
  for (const edge of edges.values()) {
    connectedNodes.add(edge.source);
    connectedNodes.add(edge.target);
  }

  // Always keep workspace-level nodes (they have structural value)
  for (const wsNodeId of workspaceNodes.values()) {
    connectedNodes.add(wsNodeId);
  }

  // Filter: keep only connected nodes + mark isolated
  const filteredNodes: GraphNode[] = [];
  let isolatedCount = 0;
  for (const [nodeId, node] of nodes) {
    if (connectedNodes.has(nodeId)) {
      filteredNodes.push(node);
    } else {
      isolatedCount++;
    }
  }

  graph.nodes = filteredNodes;
  graph.edges = Array.from(edges.values());
  graph.metadata.totalNodes = filteredNodes.length;
  graph.metadata.totalEdges = graph.edges.length;

  progress?.tick(
    `filtered: ${filteredNodes.length} nodes, ${graph.edges.length} edges`
  );

  return graph;
}

// ─── Helper Functions ─────────────────────────────────────────────────────

function getNodeKind(decl: Node): NodeKind | null {
  if (
    decl.isKind(SyntaxKind.FunctionDeclaration) ||
    decl.isKind(SyntaxKind.ArrowFunction)
  ) {
    return "function";
  }
  if (decl.isKind(SyntaxKind.ClassDeclaration)) {
    return "class";
  }
  if (decl.isKind(SyntaxKind.InterfaceDeclaration)) {
    return "interface";
  }
  if (decl.isKind(SyntaxKind.TypeAliasDeclaration)) {
    return "type";
  }
  if (decl.isKind(SyntaxKind.EnumDeclaration)) {
    return "enum";
  }
  if (
    decl.isKind(SyntaxKind.VariableDeclaration) ||
    decl.isKind(SyntaxKind.VariableStatement)
  ) {
    return "const";
  }
  // Module declarations (e.g., `declare module "..."`)
  if (decl.isKind(SyntaxKind.ModuleDeclaration)) {
    return "type";
  }
  return null;
}

function isEntryPointFile(relPath: string): boolean {
  const basename = relPath.split("/").pop() || "";
  return (
    basename === "index.ts" ||
    basename === "index.tsx" ||
    basename === "main.tsx"
  );
}

function isInternalImport(moduleSpecifier: string): boolean {
  // Relative imports: ./foo, ../foo/bar
  if (moduleSpecifier.startsWith(".")) return true;

  // Workspace alias imports: @hoox-sh/hoox-shared
  if (moduleSpecifier.startsWith("@hoox-sh/")) return true;

  // Direct workspace path imports (unlikely but possible)
  if (
    moduleSpecifier.startsWith("packages/") ||
    moduleSpecifier.startsWith("workers/") ||
    moduleSpecifier.startsWith("pages/")
  ) {
    return true;
  }

  return false;
}

function isBuiltInType(name: string): boolean {
  const builtins = new Set([
    "string",
    "number",
    "boolean",
    "undefined",
    "null",
    "void",
    "never",
    "any",
    "unknown",
    "symbol",
    "bigint",
    "object",
    "Promise",
    "Array",
    "Map",
    "Set",
    "Record",
    "Partial",
    "Required",
    "Readonly",
    "Pick",
    "Omit",
    "Exclude",
    "Extract",
    "NonNullable",
    "ReturnType",
    "Parameters",
    "Error",
    "Date",
    "RegExp",
    "Function",
    "stringify",
    "parse",
  ]);
  return builtins.has(name);
}

function resolveTypeReference(
  typeName: string,
  nodes: Map<string, GraphNode>,
  _project?: Project
): string | null {
  // Handle generic type references: Foo<T> → Foo
  const cleanName = typeName.split("<")[0].split(".")[0].trim();
  if (isBuiltInType(cleanName)) return null;

  // Search all nodes for a matching export name
  for (const [nodeId, node] of nodes) {
    if (node.exports.includes(cleanName)) {
      return nodeId;
    }
  }

  return null;
}

function createEdge(
  sourceId: string,
  targetId: string | null,
  kind: EdgeKind,
  label: string | undefined,
  edgeMap: Map<string, GraphEdge>
): GraphEdge | null {
  if (sourceId === targetId) return null; // skip self-references
  if (!targetId) return null;

  const edgeId = `${kind}:${sourceId}->${targetId}`;
  if (edgeMap.has(edgeId)) return null; // deduplicate

  const edge: GraphEdge = {
    id: edgeId,
    source: sourceId,
    target: targetId,
    kind,
    label: label || undefined,
  };
  edgeMap.set(edgeId, edge);
  return edge;
}

function resolveWorkspaceDependency(
  depName: string,
  workspaces: WorkspaceInfo[]
): string | null {
  // Map npm package names to workspace paths
  // @hoox-sh/hoox-shared → packages/shared
  const nameToWs: Record<string, string> = {
    "@hoox-sh/hoox-shared": "packages/shared",
    "@hoox-sh/hoox-cli": "packages/cli",
    "@hoox-sh/hoox-tui": "packages/tui",
  };

  if (nameToWs[depName]) return nameToWs[depName];

  // Fallback: check workspace package.json names
  for (const ws of workspaces) {
    try {
      const pkg = JSON.parse(
        readFileSync(join(ROOT, ws.relativePath, "package.json"), "utf-8")
      );
      if (pkg.name === depName) return ws.relativePath;
    } catch {
      continue;
    }
  }

  return null;
}

// ─── Output Writers ──────────────────────────────────────────────────────

function writeJSON(graph: Graph): void {
  writeFileSync(OUTPUT_JSON, JSON.stringify(graph, null, 2), "utf-8");
  console.log(`\n📄 Wrote ${OUTPUT_JSON}`);
  console.log(`   ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
}

function writeDOT(graph: Graph): void {
  const lines: string[] = [];

  lines.push("digraph Hoox {");
  lines.push("  rankdir=LR;");
  lines.push("  splines=polyline;");
  lines.push("  compound=true;");
  lines.push("  newrank=true;");
  lines.push("");
  lines.push("  // Node defaults");
  lines.push(
    '  node [shape=box, style=rounded, fontname="monospace", fontsize=10];'
  );
  lines.push('  edge [fontname="monospace", fontsize=8, arrowsize=0.6];');
  lines.push("");

  // Group nodes by workspace
  const nodesByWorkspace = new Map<string, GraphNode[]>();
  for (const node of graph.nodes) {
    const ws =
      node.kind === "worker" || node.kind === "package"
        ? `__root__`
        : node.workspace;
    if (!nodesByWorkspace.has(ws)) nodesByWorkspace.set(ws, []);
    nodesByWorkspace.get(ws)!.push(node);
  }

  // Sort workspaces for consistent output
  const workspaceOrder = Array.from(nodesByWorkspace.keys()).sort();

  // Track which workspace clusters were written
  let hasRoot = false;

  for (const ws of workspaceOrder) {
    const wsNodes = nodesByWorkspace.get(ws)!;
    if (ws === "__root__") {
      hasRoot = true;
      continue;
    }

    const colors = getWorkspaceColor(ws);
    const wsLabel = ws;

    lines.push(`  subgraph cluster_${ws.replace(/[^a-zA-Z0-9]/g, "_")} {`);
    lines.push(`    label=${escapeDOTId(wsLabel)};`);
    lines.push(`    style=filled;`);
    lines.push(`    fillcolor="${colors.fill}";`);
    lines.push(`    color="${colors.border}";`);
    lines.push(`    fontcolor="${colors.font}";`);
    lines.push(`    fontsize=12;`);
    lines.push(`    fontname="monospace";`);
    lines.push("");

    // Separate worker/package nodes from symbol nodes
    const wsNodes_list = wsNodes.filter(
      (n) => n.kind !== "worker" && n.kind !== "package"
    );
    const wsMetaNodes = wsNodes.filter(
      (n) => n.kind === "worker" || n.kind === "package"
    );

    // Write meta/workspace nodes first
    for (const node of wsMetaNodes) {
      const escapedId = escapeDOTId(node.id);
      lines.push(
        `    ${escapedId} [label=${escapeDOTId(node.label)}, shape=folder, style="filled,rounded", fillcolor="${colors.fill}", color="${colors.border}", fontcolor="${colors.font}", fontsize=11, penwidth=2];`
      );
    }

    // Write symbol nodes
    for (const node of wsNodes_list) {
      const escapedId = escapeDOTId(node.id);
      const shape =
        node.kind === "interface"
          ? "note"
          : node.kind === "class"
            ? "component"
            : node.kind === "type"
              ? "note"
              : node.kind === "enum"
                ? "Mrecord"
                : "box";
      const extraStyle = node.isEntryPoint ? ", penwidth=2, peripheries=2" : "";
      const label = node.isEntryPoint ? `${node.label} (entry)` : node.label;

      lines.push(
        `    ${escapedId} [label=${escapeDOTId(label)}, shape=${shape}${extraStyle}];`
      );
    }

    lines.push("  }");
    lines.push("");
  }

  // Write root-level nodes (worker/package workspace nodes) after clusters
  if (hasRoot) {
    const rootNodes = nodesByWorkspace.get("__root__")!;
    lines.push("  // Workspace-level nodes");
    for (const node of rootNodes) {
      const colors = getWorkspaceColor(node.workspace);
      const escapedId = escapeDOTId(node.id);
      lines.push(
        `  ${escapedId} [label=${escapeDOTId(node.label)}, shape=folder, style="filled,rounded", fillcolor="${colors.fill}", color="${colors.border}", fontcolor="${colors.font}", fontsize=11, penwidth=2];`
      );
    }
    lines.push("");
  }

  // Write infrastructure cluster
  const infraNodes = graph.nodes.filter((n) => n.kind === "infrastructure");
  if (infraNodes.length > 0) {
    lines.push("  // Infrastructure cluster");
    lines.push("  subgraph cluster_infrastructure {");
    lines.push('    label="Cloudflare Infrastructure";');
    lines.push("    style=filled;");
    lines.push('    fillcolor="#fff3e0";');
    lines.push('    color="#FF9800";');
    lines.push('    fontcolor="#e65100";');
    lines.push("    fontsize=12;");
    lines.push('    fontname="monospace";');
    lines.push("");

    const infraCategories: Record<
      string,
      { fill: string; border: string; font: string; shape: string }
    > = {
      database: {
        fill: "#e0f7fa",
        border: "#00ACC1",
        font: "#004d5c",
        shape: "cylinder",
      },
      storage: {
        fill: "#fce4ec",
        border: "#E91E63",
        font: "#880e4f",
        shape: "folder",
      },
      config: {
        fill: "#e8f5e9",
        border: "#4CAF50",
        font: "#1b5e20",
        shape: "note",
      },
      session: {
        fill: "#e8f5e9",
        border: "#4CAF50",
        font: "#1b5e20",
        shape: "note",
      },
      cache: {
        fill: "#e8f5e9",
        border: "#4CAF50",
        font: "#1b5e20",
        shape: "note",
      },
      queue: {
        fill: "#e3f2fd",
        border: "#2196F3",
        font: "#0d47a1",
        shape: "box3d",
      },
      coordination: {
        fill: "#ede7f6",
        border: "#673AB7",
        font: "#311b92",
        shape: "diamond",
      },
      ai: {
        fill: "#e0f2f1",
        border: "#009688",
        font: "#004d40",
        shape: "hexagon",
      },
      search: {
        fill: "#e0f2f1",
        border: "#009688",
        font: "#004d40",
        shape: "hexagon",
      },
      analytics: {
        fill: "#fff3e0",
        border: "#FF9800",
        font: "#e65100",
        shape: "box3d",
      },
      rendering: {
        fill: "#efebe9",
        border: "#795548",
        font: "#3e2723",
        shape: "box",
      },
    };

    for (const node of infraNodes) {
      const cat =
        (node as GraphNode & { category?: string }).category || "other";
      const colors = infraCategories[cat] || {
        fill: "#f5f5f5",
        border: "#9e9e9e",
        font: "#212121",
        shape: "box",
      };
      const escapedId = escapeDOTId(node.id);
      lines.push(
        `    ${escapedId} [label=${escapeDOTId(node.label)}, shape=${colors.shape}, style="filled", fillcolor="${colors.fill}", color="${colors.border}", fontcolor="${colors.font}"];`
      );
    }

    lines.push("  }");
    lines.push("");
  }

  // Write edges
  lines.push("  // Edges");
  for (const edge of graph.edges) {
    const sourceId = escapeDOTId(edge.source);
    const targetId = escapeDOTId(edge.target);

    let style = "";
    let color = "#666666";
    let arrowhead = "normal";

    switch (edge.kind) {
      case "imports":
        style = "solid";
        color = "#4A90D9";
        break;
      case "calls":
        style = "dashed";
        color = "#E91E63";
        arrowhead = "vee";
        break;
      case "extends":
        style = "bold";
        color = "#4CAF50";
        arrowhead = "empty";
        break;
      case "implements":
        style = "dotted";
        color = "#8BC34A";
        arrowhead = "empty";
        break;
      case "references":
        style = "dashed";
        color = "#FF9800";
        arrowhead = "odot";
        break;
      case "service-binding":
        style = "bold";
        color = "#673AB7";
        arrowhead = "normal";
        break;
      case "workspace-dep":
        style = "solid";
        color = "#00BCD4";
        arrowhead = "normal";
        break;
      case "infra-binding":
        style = "bold";
        color = "#FF5722";
        arrowhead = "normal";
        break;
      case "data-flow":
        style = "dashed";
        color = "#4CAF50";
        arrowhead = "vee";
        break;
    }

    const labelAttr = edge.label ? `, label=${escapeDOTId(edge.label)}` : "";
    lines.push(
      `  ${sourceId} -> ${targetId} [style=${style}, color="${color}", arrowhead=${arrowhead}${labelAttr}];`
    );
  }

  lines.push("}");

  writeFileSync(OUTPUT_DOT, lines.join("\n"), "utf-8");
  console.log(`📄 Wrote ${OUTPUT_DOT}`);
  console.log(`   ${graph.edges.length} edge statements`);
}

// ─── Architecture Layer Enhancement ──────────────────────────────────────

interface ArchitectureMetadata {
  workers: Record<
    string,
    {
      description: string;
      category: string;
      tags: string[];
      llmContext: string;
      cron: string | null;
      isPublic: boolean;
      smartPlacement: boolean;
      entryPoints: string[];
    }
  >;
  infrastructure: Record<
    string,
    {
      id: string;
      label: string;
      kind: string;
      category: string;
      description: string;
      tags: string[];
      llmContext: string;
      bindingName: string;
      usedBy?: string[];
      producer?: string;
      consumer?: string;
      className?: string;
    }
  >;
  dataFlows: Array<{
    source: string;
    target: string;
    description: string;
    flowType: string;
  }>;
  communities: Array<{
    id: string;
    label: string;
    description: string;
    nodeIds: string[];
  }>;
}

/**
 * Read dynamic worker data from wrangler.jsonc (cron, smart placement, services).
 */
function readDynamicWorkerData(workspaces: WorkspaceInfo[]): Map<
  string,
  {
    cron: string | null;
    smartPlacement: boolean;
    isPublic: boolean;
    services: string[];
  }
> {
  const data = new Map<
    string,
    {
      cron: string | null;
      smartPlacement: boolean;
      isPublic: boolean;
      services: string[];
    }
  >();

  // Known public workers
  const publicWorkers = new Set(["workers/hoox-worker", "workers/dashboard"]);

  for (const ws of workspaces) {
    if (ws.type !== "worker") continue;
    const wranglerPath = join(ROOT, ws.relativePath, "wrangler.jsonc");
    if (!existsSync(wranglerPath)) continue;

    try {
      const content = readFileSync(wranglerPath, "utf-8");
      const config = JSON.parse(stripJsoncComments(content));

      // Cron from triggers.crons
      let cron: string | null = null;
      if (config.triggers?.crons && Array.isArray(config.triggers.crons)) {
        cron = config.triggers.crons.join(", ");
      }

      // Smart placement
      const smartPlacement = config.placement?.mode === "smart";

      // Public flag
      const isPublic = publicWorkers.has(ws.relativePath);

      // Service bindings
      const services: string[] = [];
      if (config.services && Array.isArray(config.services)) {
        for (const svc of config.services) {
          if (svc.service) services.push(svc.service);
        }
      }

      data.set(ws.relativePath, { cron, smartPlacement, isPublic, services });
    } catch (err) {
      console.warn(
        `  ⚠️  Failed to read dynamic data from ${ws.relativePath}/wrangler.jsonc: ${err}`
      );
    }
  }

  return data;
}

function enhanceWithArchitectureLayer(
  graph: Graph,
  workspaces: WorkspaceInfo[]
): Graph {
  const metadataPath = join(ROOT, "graph-metadata.json");
  if (!existsSync(metadataPath)) {
    console.log(
      "  ⚠️  No graph-metadata.json found, skipping architecture layer"
    );
    return graph;
  }

  console.log("🏗️  Enhancing graph with architecture layer...");
  const archData: ArchitectureMetadata = JSON.parse(
    readFileSync(metadataPath, "utf-8")
  );

  // Read dynamic worker data from wrangler configs
  const dynamicWorkerData = readDynamicWorkerData(workspaces);

  // 1. Enhance worker nodes with semantic metadata
  for (const node of graph.nodes) {
    if (node.kind !== "worker") continue;
    const wsPath = node.filePath; // e.g., "workers/hoox-worker"
    const workerMeta = archData.workers[wsPath];
    if (!workerMeta) continue;

    // Hand-authored content (static, from metadata.json)
    node.description = workerMeta.description;
    node.category = workerMeta.category;
    node.tags = workerMeta.tags;
    node.llmContext = workerMeta.llmContext;

    // Dynamic content (fresh from wrangler.jsonc)
    const dyn = dynamicWorkerData.get(wsPath);
    node.cron = dyn?.cron ?? workerMeta.cron;
    node.isPublic = dyn?.isPublic ?? workerMeta.isPublic;
    node.smartPlacement = dyn?.smartPlacement ?? workerMeta.smartPlacement;
    node.entryPoint = workerMeta.entryPoints.join(", ");
  }

  // 2. Add infrastructure nodes
  for (const [key, infra] of Object.entries(archData.infrastructure)) {
    const infraNode: GraphNode & Record<string, unknown> = {
      id: infra.id,
      label: infra.label,
      kind: "infrastructure" as NodeKind,
      filePath: `infrastructure/${key}`,
      workspace: "infrastructure",
      exports: [],
      description: infra.description,
      category: infra.category,
      tags: infra.tags,
      llmContext: infra.llmContext,
      bindingName: infra.bindingName,
    };
    graph.nodes.push(infraNode);
    graph.metadata.nodeKinds["infrastructure"] =
      (graph.metadata.nodeKinds["infrastructure"] || 0) + 1;
  }

  // 3. Add infrastructure binding edges
  for (const [key, infra] of Object.entries(archData.infrastructure)) {
    const usedBy = infra.usedBy || [];
    for (const workerPath of usedBy) {
      const sourceNodeId = `workspace:${workerPath}`;
      const targetNodeId = infra.id;
      const role = infra.producer
        ? "producer"
        : infra.consumer
          ? "consumer"
          : undefined;
      const edgeId = `infra-binding:${workerPath}->${key}`;

      const edge: GraphEdge & Record<string, unknown> = {
        id: edgeId,
        source: sourceNodeId,
        target: targetNodeId,
        kind: "infra-binding" as EdgeKind,
        label: infra.bindingName,
        description: infra.description,
        bindingName: infra.bindingName,
      };
      if (role) edge.role = role;

      graph.edges.push(edge);
      graph.metadata.edgeKinds["infra-binding"] =
        (graph.metadata.edgeKinds["infra-binding"] || 0) + 1;
    }
  }

  // 4. Add data flow edges
  for (const flow of archData.dataFlows) {
    const sourceNodeId = `workspace:${flow.source}`;
    const targetNodeId = `workspace:${flow.target}`;
    const edgeId = `data-flow:${flow.source}->${flow.target}`;

    const edge: GraphEdge & Record<string, unknown> = {
      id: edgeId,
      source: sourceNodeId,
      target: targetNodeId,
      kind: "data-flow" as EdgeKind,
      label: flow.flowType,
      description: flow.description,
      flowType: flow.flowType,
    };

    graph.edges.push(edge);
    graph.metadata.edgeKinds["data-flow"] =
      (graph.metadata.edgeKinds["data-flow"] || 0) + 1;
  }

  // 5. Add communities
  (graph as Graph & { communities?: unknown[] }).communities =
    archData.communities;

  // 6. Add architecture layer metadata
  (graph.metadata as Record<string, unknown>).architectureLayer = {
    version: "1.0.0",
    description:
      "Architecture-level graph data for AI/LLM consumption. Includes worker nodes with semantic metadata, infrastructure nodes, service binding edges, data flow edges, and community groups.",
    llmUsageGuide:
      "Use this graph to understand the Hoox trading system architecture. Worker nodes have 'llmContext' fields with natural language descriptions. Infrastructure nodes describe bindings. Data flow edges show how signals move through the system. Community groups cluster related nodes.",
    edgeTypes: {
      imports: "Code-level import dependency",
      extends: "TypeScript class/interface extension",
      implements: "TypeScript interface implementation",
      references: "Code-level reference/usage",
      calls: "Code-level function call",
      "service-binding": "Cloudflare Service Binding (inter-worker RPC)",
      "workspace-dep": "Monorepo workspace dependency",
      "infra-binding":
        "Cloudflare infrastructure binding (D1, R2, KV, Queue, DO, AI, Vectorize, Analytics Engine, Browser Rendering)",
      "data-flow":
        "Logical data flow between workers (signal processing pipeline)",
    },
    nodeTypes: {
      type: "TypeScript type alias",
      interface: "TypeScript interface",
      const: "TypeScript const declaration",
      function: "TypeScript function",
      class: "TypeScript class",
      enum: "TypeScript enum",
      package: "Monorepo package",
      worker: "Cloudflare Worker service",
      infrastructure:
        "Cloudflare infrastructure resource (D1, R2, KV, Queue, DO, AI, Vectorize, Analytics Engine, Browser Rendering)",
    },
  };

  // Update counts
  graph.metadata.totalNodes = graph.nodes.length;
  graph.metadata.totalEdges = graph.edges.length;
  (graph.metadata as Record<string, unknown>).enhancedAt =
    new Date().toISOString();

  console.log(
    `  ✅ Added ${Object.keys(archData.infrastructure).length} infrastructure nodes`
  );
  console.log(`  ✅ Added ${archData.dataFlows.length} data flow edges`);
  console.log(`  ✅ Added ${archData.communities.length} community groups`);
  console.log(
    `  ✅ Enhanced ${Object.keys(archData.workers).length} worker nodes with semantic metadata`
  );

  return graph;
}

/**
 * Regenerate graph-metadata.json by overlaying dynamic data
 * (cron, entryPoints, smartPlacement, isPublic, usedBy, producer, consumer)
 * on top of the hand-authored base metadata.
 */
function regenerateMetadataFile(
  graph: Graph,
  workspaces: WorkspaceInfo[]
): void {
  const metadataPath = join(ROOT, "graph-metadata.json");
  if (!existsSync(metadataPath)) {
    console.log("  ⚠️  No graph-metadata.json to regenerate");
    return;
  }

  console.log("🔄 Regenerating graph-metadata.json with fresh dynamic data...");

  const archData: ArchitectureMetadata = JSON.parse(
    readFileSync(metadataPath, "utf-8")
  );

  // Read fresh dynamic worker data from wrangler configs
  const dynamicWorkerData = readDynamicWorkerData(workspaces);

  // ── 1. Update worker metadata with fresh dynamic data ─────────────────
  for (const [wsPath, workerMeta] of Object.entries(archData.workers)) {
    const dyn = dynamicWorkerData.get(wsPath);
    if (!dyn) continue;

    // Overlay dynamic fields
    if (dyn.cron !== null) {
      workerMeta.cron = dyn.cron;
    }
    workerMeta.smartPlacement = dyn.smartPlacement;
    workerMeta.isPublic = dyn.isPublic;

    // Derive entryPoints from wrangler triggers + existing hand-authored routes
    const wranglerPath = join(ROOT, wsPath, "wrangler.jsonc");
    if (existsSync(wranglerPath)) {
      try {
        const content = readFileSync(wranglerPath, "utf-8");
        const config = JSON.parse(stripJsoncComments(content));

        // Update cron from triggers
        if (config.triggers?.crons && Array.isArray(config.triggers.crons)) {
          workerMeta.cron = config.triggers.crons.join(", ");
        }

        // Add scheduled entry points from cron triggers
        const hasCron =
          config.triggers?.crons && config.triggers.crons.length > 0;
        const existingEntryPoints = new Set(workerMeta.entryPoints || []);
        if (
          hasCron &&
          ![...existingEntryPoints].some((ep) => ep.startsWith("scheduled"))
        ) {
          const crons = config.triggers.crons.join(", ");
          existingEntryPoints.add(`scheduled (${crons})`);
          workerMeta.entryPoints = [...existingEntryPoints];
        }
      } catch {
        // Silently skip if wrangler.jsonc is unparseable
      }
    }
  }

  // ── 2. Update infrastructure usedBy from graph edges ──────────────────
  // Build reverse lookup: infra id → set of worker paths
  const infraUsers = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (edge.kind !== "infra-binding") continue;
    const targetId = edge.target; // infra node id, e.g., "infra:d1:trade-data-db"
    const sourceId = edge.source; // worker node id, e.g., "workspace:workers/hoox-worker"
    const workerPath = sourceId.replace("workspace:", "");
    if (!infraUsers.has(targetId)) {
      infraUsers.set(targetId, new Set());
    }
    infraUsers.get(targetId)!.add(workerPath);
  }

  for (const [, infra] of Object.entries(archData.infrastructure)) {
    const users = infraUsers.get(infra.id);
    if (users && users.size > 0) {
      infra.usedBy = [...users].sort();
    }

    // For queue resources, attempt to derive producer/consumer from binding names
    // (producer/consumer aren't captured in the graph, so we preserve hand-authored values)
  }

  // ── 3. Update data flows with service-binding verification info ───────
  // Build a set of existing service-binding pairs for cross-reference
  const sbPairs = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.kind !== "service-binding") continue;
    const src = edge.source.replace("workspace:", "");
    const tgt = edge.target.replace("workspace:", "");
    sbPairs.add(`${src}→${tgt}`);
  }

  for (const flow of archData.dataFlows) {
    const pair = `${flow.source}→${flow.target}`;
    // Service-binding pairs are tracked in `sbPairs` for cross-reference;
    // the data flow itself is still valid as a logical flow.
    void pair;
  }

  // ── 4. Write updated metadata ─────────────────────────────────────────
  const output = JSON.stringify(archData, null, 2);
  writeFileSync(OUTPUT_METADATA, output, "utf-8");
  console.log(`  ✅ Wrote ${OUTPUT_METADATA}`);
  console.log(
    `  ✅ Updated ${Object.keys(archData.workers).length} workers, ${Object.keys(archData.infrastructure).length} infrastructure`
  );
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║   Hoox Monorepo Function & Relationship Graph       ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  console.log("📁 Discovering workspaces...");
  const workspaces = discoverWorkspaces();
  console.log(`   Found ${workspaces.length} workspaces:`);
  for (const ws of workspaces) {
    const typeLabel = ws.type.padEnd(7);
    console.log(
      `   • ${ws.relativePath} (${typeLabel}, src:${ws.hasSrc}, app:${ws.hasApp})`
    );
  }
  console.log("");

  const progress = new ProgressBar(8);
  const graph = extractGraph(workspaces, progress);
  progress.finish();

  // Enhance with architecture layer (workers, infrastructure, data flows, communities)
  const enhancedGraph = enhanceWithArchitectureLayer(graph, workspaces);

  // Regenerate graph-metadata.json with fresh dynamic data
  regenerateMetadataFile(enhancedGraph, workspaces);

  const totalTime = progress.totalTime();

  console.log("\n📊 Writing output files...");
  writeJSON(enhancedGraph);
  writeDOT(enhancedGraph);

  // Summary
  console.log("\n📈 Summary:");
  const kindBreakdown = Object.entries(enhancedGraph.metadata.nodeKinds)
    .sort(([, a], [, b]) => b - a)
    .map(([k, v]) => `      ${k}: ${v}`)
    .join("\n");
  console.log(`   Nodes by kind:\n${kindBreakdown}`);
  const edgeBreakdown = Object.entries(enhancedGraph.metadata.edgeKinds)
    .sort(([, a], [, b]) => b - a)
    .map(([k, v]) => `      ${k}: ${v}`)
    .join("\n");
  console.log(`   Edges by kind:\n${edgeBreakdown}`);

  console.log(`\n⏱  Total time: ${totalTime}s`);
  console.log("\n✅ Graph extraction complete!");
  console.log(`   → ${OUTPUT_JSON}`);
  console.log(`   → ${OUTPUT_DOT}`);
  console.log("\n💡 To render DOT to SVG:");
  console.log("   dot -Tsvg graph.dot -o graph.svg && open graph.svg");
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
