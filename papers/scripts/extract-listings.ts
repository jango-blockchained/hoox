#!/usr/bin/env bun
/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Extract code excerpts from the monorepo into papers/listings/.
 *
 * Usage (from repo root):
 *   bun papers/scripts/extract-listings.ts
 *
 * Manifest: papers/listings/manifest.yaml
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const REPO_ROOT = join(import.meta.dir, "../..");
const PAPERS_DIR = join(REPO_ROOT, "papers");
const MANIFEST_PATH = join(PAPERS_DIR, "listings/manifest.yaml");
const OUTPUT_DIR = join(PAPERS_DIR, "listings");

interface ListingEntry {
  id: string;
  source: string;
  startLine: number;
  endLine: number;
  output: string;
  caption: string;
}

interface Manifest {
  listings: ListingEntry[];
}

function parseManifest(raw: string): Manifest {
  const listings: ListingEntry[] = [];
  let current: Partial<ListingEntry> = {};

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || trimmed === "" || trimmed === "listings:")
      continue;

    const match = trimmed.match(/^-?\s*([\w]+):\s*(.*)$/);
    if (!match) continue;

    const [, key, value] = match;
    const unquoted = value.replace(/^["']|["']$/g, "");

    if (key === "id" && Object.keys(current).length > 0) {
      listings.push(current as ListingEntry);
      current = {};
    }

    if (key === "id") current.id = unquoted;
    else if (key === "source") current.source = unquoted;
    else if (key === "startLine") current.startLine = Number(unquoted);
    else if (key === "endLine") current.endLine = Number(unquoted);
    else if (key === "output") current.output = unquoted;
    else if (key === "caption") current.caption = unquoted;
  }

  if (Object.keys(current).length > 0) {
    listings.push(current as ListingEntry);
  }

  return { listings };
}

/** Replace Unicode punctuation that breaks pdfLaTeX listings. */
function sanitizeForLatex(text: string): string {
  return text
    .replace(/\u2014/g, "--") // em dash
    .replace(/\u2013/g, "-") // en dash
    .replace(/\u2026/g, "...") // ellipsis
    .replace(/\u2192/g, "->") // arrow
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');
}

function extractLines(
  sourcePath: string,
  startLine: number,
  endLine: number
): string[] {
  const abs = join(REPO_ROOT, sourcePath);
  if (!existsSync(abs)) {
    throw new Error(`Source not found: ${sourcePath}`);
  }
  const lines = readFileSync(abs, "utf-8").split("\n");
  if (startLine < 1 || endLine > lines.length || startLine > endLine) {
    throw new Error(
      `Invalid range ${startLine}-${endLine} for ${sourcePath} (${lines.length} lines)`
    );
  }
  return lines.slice(startLine - 1, endLine);
}

function main(): void {
  if (!existsSync(MANIFEST_PATH)) {
    console.error(`Manifest not found: ${MANIFEST_PATH}`);
    process.exit(1);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const manifest = parseManifest(readFileSync(MANIFEST_PATH, "utf-8"));
  let count = 0;

  for (const entry of manifest.listings) {
    const body = extractLines(entry.source, entry.startLine, entry.endLine);
    const header = [
      `// Source: ${entry.source} (lines ${entry.startLine}-${entry.endLine})`,
      `// Listing id: ${entry.id}`,
      `// Caption: ${entry.caption}`,
      "",
    ].join("\n");

    const outPath = join(OUTPUT_DIR, entry.output);
    const content = sanitizeForLatex(header + body.join("\n") + "\n");
    writeFileSync(outPath, content, "utf-8");
    console.log(
      `  ${entry.output}  ←  ${entry.source}:${entry.startLine}-${entry.endLine}`
    );
    count++;
  }

  console.log(`\nExtracted ${count} listing(s) to papers/listings/`);
}

main();
