/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface PackageJson {
  scripts?: Record<string, string>;
}

const packageJsonPath = join(process.cwd(), "package.json");
const packageJson = JSON.parse(
  readFileSync(packageJsonPath, "utf8")
) as PackageJson;

const targetScript = packageJson.scripts?.["migrate:tracking"];

if (!targetScript) {
  console.error('Missing "migrate:tracking" script in package.json');
  process.exit(1);
}

const expectedPath = join(process.cwd(), "scripts", "migrate-tracking.sh");

if (!existsSync(expectedPath)) {
  console.error(`Missing script file: ${expectedPath}`);
  process.exit(1);
}

if (!targetScript.includes("scripts/migrate-tracking.sh")) {
  console.error(
    `Expected "migrate:tracking" to reference scripts/migrate-tracking.sh, got: ${targetScript}`
  );
  process.exit(1);
}

console.log("Script path checks passed.");
