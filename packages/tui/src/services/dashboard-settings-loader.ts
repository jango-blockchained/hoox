/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Load worker dashboard.jsonc manifests for the TUI worker-settings view.
 * Thin wrapper around shared filesystem discovery.
 */
import {
  loadDashboardManifestsFromRoot,
  resolveHooxRuntimeRoot,
  type WorkerDashboardManifest,
} from "@jango-blockchained/hoox-shared";
import { join } from "node:path";

/**
 * Discover and parse all dashboard settings manifests available in the
 * current runtime monorepo (or empty list when not found).
 */
export function loadDashboardSettingsManifests(
  runtimeRoot?: string | null
): WorkerDashboardManifest[] {
  const root =
    runtimeRoot ??
    resolveHooxRuntimeRoot().root ??
    // packages/tui/src/services → monorepo root
    join(import.meta.dir, "..", "..", "..", "..");

  return loadDashboardManifestsFromRoot(root);
}
