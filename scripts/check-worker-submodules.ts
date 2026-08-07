#!/usr/bin/env bun
/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from "node:fs";
import path from "node:path";

const requiredWorkerDirs = [
  "workers/hoox-worker",
  "workers/trade-worker",
  "workers/agent-worker",
  "workers/d1-worker",
  "workers/telegram-worker",
  "workers/web3-wallet-worker",
  "workers/email-worker",
  "workers/analytics-worker",
  "workers/report-worker",
  "workers/pyne-worker",
];

const missing = requiredWorkerDirs.filter(
  (workerDir) => !fs.existsSync(path.resolve(process.cwd(), workerDir))
);

if (missing.length > 0) {
  console.error("❌ Worker submodule content is missing.");
  console.error("Missing directories:");
  for (const workerDir of missing) {
    console.error(`- ${workerDir}`);
  }
  console.error("\nRun this command and retry:");
  console.error("git submodule update --init --recursive");
  process.exit(1);
}

console.log("✅ Worker submodule content is present.");
