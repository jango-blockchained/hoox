/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * UpdateService — manages wrangler version updates.
 *
 * Checks current wrangler version, compares against minimum, and updates
 * via `bun update wrangler` when needed. Integrates with PrerequisitesService
 * for version checking.
 */

import { PrerequisitesService } from "../prerequisites/index.js";
import { theme } from "../../utils/theme.js";
import { confirm } from "@clack/prompts";

export interface UpdateResult {
  updated: boolean;
  previousVersion?: string;
  newVersion?: string;
  error?: string;
}

export class UpdateService {
  private readonly prereqs: PrerequisitesService;
  private readonly cwd: string;
  /**
   * Injectable update runner. Defaults to spawning `bun update wrangler`
   * in {@link runUpdate}. Tests pass a stub so no real network install
   * is performed.
   */
  private readonly updateRunner: () => Promise<{
    exitCode: number;
    stderr: string;
  }>;

  constructor(
    cwd?: string,
    prereqs?: PrerequisitesService,
    updateRunner?: () => Promise<{ exitCode: number; stderr: string }>
  ) {
    this.prereqs = prereqs ?? new PrerequisitesService();
    this.cwd = cwd ?? process.cwd();
    this.updateRunner =
      updateRunner ??
      (async () => {
        const proc = Bun.spawn(["bun", "update", "wrangler"], {
          cwd: this.cwd,
          stdout: "ignore",
          stderr: "pipe",
        });
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;
        return { exitCode, stderr };
      });
  }

  /**
   * Check if wrangler is outdated. If yes, prompt user (TTY) or
   * auto-update (non-TTY / --yes flag). Never throws — errors are
   * returned in UpdateResult.
   *
   * @param options.yes     Auto-update without prompt when outdated
   * @param options.silent  Suppress “up to date” / skip noise (still
   *                        reports failures and real updates)
   */
  async checkAndPromptUpdate(options?: {
    yes?: boolean;
    silent?: boolean;
  }): Promise<UpdateResult> {
    const silent = options?.silent === true;
    try {
      const versionCheck = await this.prereqs.checkWranglerVersion();

      if (!versionCheck.outdated) {
        if (!silent) {
          process.stdout.write(
            `  ${theme.success("✓")} Wrangler ${versionCheck.current} is up to date\n`
          );
        }
        return { updated: false };
      }

      const current = versionCheck.current ?? "unknown";
      const minimum = versionCheck.minimum ?? "unknown";

      // Fetch latest available version for the prompt
      const latest = await this.checkLatestVersion();

      // Determine if we should prompt or auto-update
      let shouldUpdate: boolean;
      if (options?.yes ?? !process.stdout.isTTY) {
        shouldUpdate = true;
      } else {
        shouldUpdate = await this.promptUpdate(current, minimum, latest);
      }

      if (!shouldUpdate) {
        if (!silent) {
          process.stdout.write(
            `  ${theme.warning("!")} Skipping wrangler update (current: ${current})\n`
          );
        }
        return { updated: false };
      }

      return await this.runUpdate();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!silent) {
        process.stdout.write(
          `  ${theme.error("!")} Wrangler update check failed: ${message}\n`
        );
      }
      return { updated: false, error: message };
    }
  }

  /**
   * Force-update wrangler regardless of current version.
   * Used by the standalone `hoox update` command.
   */
  async updateWrangler(): Promise<UpdateResult> {
    process.stdout.write(`  ${theme.info("i")} Checking wrangler version...\n`);

    const before = await this.prereqs.checkWranglerVersion();
    const previousVersion = before.current;

    if (!previousVersion) {
      process.stdout.write(
        `  ${theme.warning("!")} Wrangler is not installed. Install with: bun add -g wrangler\n`
      );
      return { updated: false, error: "Wrangler not installed" };
    }

    const result = await this.runUpdate(previousVersion);
    return { ...result, previousVersion };
  }

  /**
   * Check the latest available wrangler version from the npm registry.
   * Uses the npm registry JSON API directly — no dependency on npm CLI.
   * Returns null if the check fails (network error, etc.).
   */
  async checkLatestVersion(): Promise<string | null> {
    try {
      const res = await fetch("https://registry.npmjs.org/wrangler/latest");
      if (!res.ok) return null;
      const data = (await res.json()) as { version?: string };
      return data.version ?? null;
    } catch {
      return null;
    }
  }

  // ── Private helpers ──────────────────────────────────────────────

  /**
   * Prompt the user whether to update wrangler.
   * Returns true if the user wants to update.
   */
  private async promptUpdate(
    current: string,
    minimum: string,
    latest: string | null
  ): Promise<boolean> {
    const latestStr = latest ? `, latest: ${latest}` : "";
    process.stdout.write(
      `\n  ${theme.warning("!")} Wrangler ${current} is outdated (minimum: ${minimum}${latestStr})\n`
    );

    const result = await confirm({
      message: "Update wrangler?",
      initialValue: true,
    });

    // Confirm returns boolean | symbol (CLACK_CANCEL)
    return result === true;
  }

  /**
   * Run `bun update wrangler` in the project root and verify the result.
   */
  private async runUpdate(previousVersion?: string): Promise<UpdateResult> {
    process.stdout.write(`  ${theme.info("i")} Updating wrangler...\n`);

    try {
      const { exitCode, stderr } = await this.updateRunner();

      if (exitCode !== 0) {
        const errorMsg = stderr.split("\n")[0] || "bun update wrangler failed";
        process.stdout.write(
          `  ${theme.error("!")} Update failed: ${errorMsg}\n`
        );
        return { updated: false, error: errorMsg };
      }

      // Verify the new version
      const verify = await this.prereqs.checkWranglerVersion();
      const newVersion = verify.current;

      const versionChanged = previousVersion
        ? previousVersion !== newVersion
        : true;

      if (versionChanged) {
        process.stdout.write(
          `  ${theme.success("✓")} Wrangler updated from ${previousVersion ?? "?"} to ${newVersion}\n`
        );
      } else {
        process.stdout.write(
          `  ${theme.warning("!")} Wrangler version unchanged (${newVersion})\n`
        );
      }

      return {
        updated: versionChanged,
        previousVersion,
        newVersion,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stdout.write(`  ${theme.error("!")} Update failed: ${message}\n`);
      return { updated: false, error: message };
    }
  }
}
