#!/usr/bin/env bun
/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Create an arXiv-ready source tarball from papers/.
 *
 * Usage (from repo root):
 *   bun papers/scripts/package-arxiv.ts
 *
 * Prerequisite: make pdf-tikz (builds PDF + figures + listings)
 *
 * Output: papers/dist/hoox-arxiv-submission.tar.gz
 */

import { mkdirSync, existsSync, readdirSync, statSync, cpSync } from "node:fs";
import { join, relative } from "node:path";
import { $ } from "bun";

const PAPERS_DIR = join(import.meta.dir, "..");
const DIST_DIR = join(PAPERS_DIR, "dist");

// Support building tarball for core or full via env var PAPER (e.g. PAPER=hoox-arxiv-paper-core)
const paperName = process.env.PAPER || "hoox-arxiv-paper";
const STAGING = join(DIST_DIR, `${paperName}-arxiv-submission`);
const ARCHIVE = join(DIST_DIR, `${paperName}-arxiv-submission.tar.gz`);

const INCLUDE_PATHS = [
  `${paperName}.tex`,
  "front-matter.tex",
  "macros.tex",
  "references.bib",
  "Makefile",
  "arxiv-submission.md",
  "sections",
  "appendices",
  "listings",
  "generated",
  "figures",
  "scripts/extract-listings.ts",
  "scripts/generate-listings-index.ts",
  "scripts/sync-graph-tables.ts",
  "scripts/package-arxiv.ts",
];

const INCLUDE_GLOBS_EXT = [
  ".tex",
  ".bib",
  ".ts",
  ".yaml",
  ".jsonc",
  ".sql",
  ".js",
  ".md",
  ".pdf",
];

function shouldCopyFile(name: string): boolean {
  if (name.endsWith(".aux") || name.endsWith(".log") || name.endsWith(".blg")) {
    return false;
  }
  if (name === "Makefile") return true;
  return INCLUDE_GLOBS_EXT.some((ext) => name.endsWith(ext));
}

function copyTree(src: string, dest: string): void {
  const st = statSync(src);
  if (st.isFile()) {
    if (shouldCopyFile(src.split("/").pop() ?? "")) {
      cpSync(src, dest);
    }
    return;
  }
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    if (entry === "dist" || entry === "node_modules") continue;
    copyTree(join(src, entry), join(dest, entry));
  }
}

async function main(): Promise<void> {
  const pdfName = `${paperName}.pdf`;
  const pdfPath = join(PAPERS_DIR, pdfName);
  if (!existsSync(pdfPath)) {
    console.error(
      `Missing ${pdfName} — run: cd papers && make pdf-tikz (or pdf-tikz-core)`
    );
    process.exit(1);
  }

  mkdirSync(DIST_DIR, { recursive: true });
  if (existsSync(STAGING)) {
    await $`rm -rf ${STAGING}`.quiet();
  }
  mkdirSync(STAGING, { recursive: true });

  for (const rel of INCLUDE_PATHS) {
    const src = join(PAPERS_DIR, rel);
    if (!existsSync(src)) {
      console.warn(`Skip missing: ${rel}`);
      continue;
    }
    const dest = join(STAGING, rel);
    copyTree(src, dest);
    console.log(`  ${rel}`);
  }

  cpSync(pdfPath, join(STAGING, `${paperName}.pdf`));

  // Use a stable staging dir name for tar, but include the paper variant name inside
  const tarDirName = `${paperName}-arxiv-submission`;
  await $`tar -czf ${ARCHIVE} -C ${DIST_DIR} ${tarDirName}`.quiet();

  const size = statSync(ARCHIVE).size;
  console.log(
    `\nCreated ${relative(PAPERS_DIR, ARCHIVE)} (${(size / 1024).toFixed(0)} KiB)`
  );
  console.log(`Upload ${paperName}.pdf + the tarball to arXiv.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
