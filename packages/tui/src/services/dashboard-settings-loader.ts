/**
 * Load worker dashboard.jsonc manifests for the TUI worker-settings view.
 * Prefer monorepo workers/&lt;name&gt;/dashboard.jsonc; fall back to synced copies
 * under workers/dashboard/public/workers when present.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DASHBOARD_WORKER_IDS,
  dashboardWorkerDir,
  parseDashboardManifest,
  resolveHooxRuntimeRoot,
  type WorkerDashboardManifest,
} from "@jango-blockchained/hoox-shared";

function tryRead(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

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
    // walk from this package: packages/tui → monorepo root
    join(import.meta.dir, "..", "..", "..", "..");

  const manifests: WorkerDashboardManifest[] = [];
  const seen = new Set<string>();

  // 1) workers/*/dashboard.jsonc (source of truth)
  const workersDir = join(root, "workers");
  if (existsSync(workersDir)) {
    for (const workerId of DASHBOARD_WORKER_IDS) {
      const dir = dashboardWorkerDir(workerId);
      const path = join(workersDir, dir, "dashboard.jsonc");
      const content = tryRead(path);
      if (!content) continue;
      const m = parseDashboardManifest(content, workerId);
      if (m.sections.length > 0) {
        manifests.push(m);
        seen.add(workerId);
      }
    }
    // Also pick up any other worker with dashboard.jsonc
    try {
      for (const entry of readdirSync(workersDir)) {
        if (entry === "dashboard") continue;
        const workerId =
          entry === "hoox-worker" || entry === "hoox" ? "hoox" : entry;
        if (seen.has(workerId)) continue;
        const path = join(workersDir, entry, "dashboard.jsonc");
        const content = tryRead(path);
        if (!content) continue;
        const m = parseDashboardManifest(content, workerId);
        if (m.sections.length > 0) {
          manifests.push(m);
          seen.add(workerId);
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 2) Fallback: dashboard public copies (synced)
  const publicDir = join(workersDir, "dashboard", "public", "workers");
  if (existsSync(publicDir)) {
    try {
      for (const file of readdirSync(publicDir)) {
        if (!file.endsWith(".jsonc") && !file.endsWith(".json")) continue;
        const base = file.replace(/\.jsonc?$/, "");
        const workerId =
          base === "hoox-worker" || base === "hoox" ? "hoox" : base;
        if (seen.has(workerId)) continue;
        const content = tryRead(join(publicDir, file));
        if (!content) continue;
        const m = parseDashboardManifest(content, workerId);
        if (m.sections.length > 0) {
          manifests.push(m);
          seen.add(workerId);
        }
      }
    } catch {
      /* ignore */
    }
  }

  return manifests;
}
