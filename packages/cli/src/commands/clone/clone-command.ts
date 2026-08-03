/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `hoox clone` command — clone worker repos as git submodules.
 *
 * Modes:
 *   hoox clone           — List workers with clone status (cloned / not cloned)
 *   hoox clone --all     — Clone all workers from wrangler.jsonc
 *   hoox clone <name>    — Clone a specific worker by name
 *
 * Repo URLs are derived from: https://github.com/<org>/<worker-name>.git
 * The org is auto-detected from `git remote get-url origin` or set via --org.
 *
 * The --home flag clones workers into $HOME/.hoox/workers instead of the
 * default workers/ directory.
 *
 * Uses @clack/prompts spinner for progress feedback.
 */
import { Command } from "commander";
import { spinner } from "@clack/prompts";
import { ConfigService } from "../../services/config/index.js";
import { getHooxHome } from "@hoox-sh/hoox-shared";
import { icons } from "../../utils/theme.js";
import {
  formatSuccess,
  formatError,
  formatTable,
  formatJson,
  getFormatOptions,
  formatDuration,
} from "../../utils/formatters.js";
import { startTimer } from "../../utils/timer.js";
import { CLIError, ExitCode } from "../../utils/errors.js";
import { withErrorHandling } from "../../utils/error-handler.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-worker clone status entry. */
interface CloneStatus {
  worker: string;
  path: string;
  cloned: boolean;
  repo?: string;
  error?: string;
}

/**
 * Resolve the base GitHub URL for worker repos.
 * Tries `git remote get-url origin` first, falls back to a sensible default.
 *
 * Examples:
 *   https://github.com/org/repo.git  →  https://github.com/org
 *   git@github.com:org/repo.git      →  https://github.com/org
 */
async function resolveRepoBase(): Promise<string> {
  try {
    const proc = Bun.spawn(["git", "remote", "get-url", "origin"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode === 0) {
      const url = (await new Response(proc.stdout).text()).trim();
      const match = url.match(/github\.com[:/]([^/]+)\/.+?(?:\.git)?$/);
      if (match) {
        return `https://github.com/${match[1]}`;
      }
    }
  } catch {
    // Fall through to default
  }
  return "https://github.com/hoox-sh";
}

/** Build a repo URL from the org base and worker name. */
function getRepoUrl(orgBase: string, workerName: string): string {
  return `${orgBase}/${workerName}.git`;
}

/**
 * Check whether a worker is already cloned (has a `.git` entry).
 * For git submodules this is a file (not a directory) pointing to the
 * superproject's modules directory.
 */
async function isWorkerCloned(workerPath: string): Promise<boolean> {
  const dotGit = Bun.file(`${workerPath}/.git`);
  return dotGit.exists();
}

/**
 * Run `git submodule add <repo> <path>` to clone a single worker.
 * Returns a CloneStatus with the outcome.
 *
 * @param repoUrl - Repository URL to clone
 * @param targetPath - Target path for the submodule
 * @param name - Worker name
 * @param cwd - Current working directory for git command
 * @param homeDir - Optional home directory path (if --home flag is set)
 */
async function cloneWorker(
  repoUrl: string,
  targetPath: string,
  name: string,
  cwd: string,
  homeDir?: string
): Promise<CloneStatus> {
  // If homeDir is specified, adjust the target path to be relative to home
  const adjustedPath = homeDir
    ? targetPath.replace(/^workers\//, "")
    : targetPath;
  const finalPath = homeDir ? `${homeDir}/workers/${adjustedPath}` : targetPath;

  const proc = Bun.spawn(["git", "submodule", "add", repoUrl, finalPath], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    return {
      worker: name,
      path: finalPath,
      cloned: false,
      repo: repoUrl,
      error:
        stderr.trim() || `git submodule add failed with exit code ${exitCode}`,
    };
  }

  return {
    worker: name,
    path: finalPath,
    cloned: true,
    repo: repoUrl,
  };
}

/** Run `git submodule update --init --recursive`. */
async function updateSubmodules(cwd: string): Promise<void> {
  const proc = Bun.spawn(
    ["git", "submodule", "update", "--init", "--recursive"],
    {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    }
  );

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(
      stderr.trim() || `git submodule update failed with exit code ${exitCode}`
    );
  }
}

/**
 * Build the list of worker clone statuses, checking the filesystem for
 * whether each worker has already been cloned.
 *
 * @param configService - Configuration service instance
 * @param repoBase - Base repository URL
 * @param homeDir - Optional home directory path (if --home flag is set)
 */
async function buildStatusList(
  configService: ConfigService,
  repoBase: string,
  homeDir?: string
): Promise<CloneStatus[]> {
  const workers = configService.listWorkers();
  const statuses: CloneStatus[] = [];

  for (const name of workers) {
    const workerConfig = configService.getWorker(name);
    if (!workerConfig) continue;

    // Adjust path if homeDir is specified
    const checkPath = homeDir
      ? `${homeDir}/workers/${workerConfig.path.replace(/^workers\//, "")}`
      : workerConfig.path;

    const cloned = await isWorkerCloned(checkPath);
    statuses.push({
      worker: name,
      path: checkPath,
      cloned,
      repo: getRepoUrl(repoBase, name),
    });
  }

  return statuses;
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

/**
 * Register the `hoox clone` command on the given commander program.
 *
 * @example
 * ```ts
 * import { registerCloneCommand } from "./commands/clone/index.js";
 * registerCloneCommand(program);
 * ```
 */
export function registerCloneCommand(program: Command): void {
  program
    .command("clone")
    .summary("Clone worker repositories as git submodules")
    .description(
      `Clone worker repositories from GitHub as git submodules.

Workers in the Hoox monorepo are stored as git submodules. This command helps you clone them.

MODES:
  hoox clone              List clone status of all workers
  hoox clone --all        Clone all workers
  hoox clone <name>      Clone a specific worker

OPTIONS:
  --all       Clone all worker repositories
  --home      Clone into $HOME/.hoox/workers instead of default location
  --org <org> GitHub organization (auto-detected from git remote by default)

ARGUMENTS:
  name      Optional worker name to clone (e.g., trade-worker, agent-worker)

EXAMPLES:
  hoox clone                     List all workers' clone status
  hoox clone --all               Clone all workers
  hoox clone --all --home        Clone all workers to $HOME/.hoox/workers
  hoox clone trade-worker        Clone specific worker
  hoox clone trade-worker --home Clone specific worker to $HOME/.hoox/workers
  hoox clone --org my-org        Clone from specific org`
    )
    .option("--all", "Clone all worker repositories")
    .option(
      "--home",
      "Clone into $HOME/.hoox/workers instead of default location"
    )
    .option(
      "--org <org>",
      "GitHub organization (derived from git remote by default)"
    )
    .argument("[name]", "Worker name to clone (omit to list status)")
    .action(
      withErrorHandling(
        async (
          name: string | undefined,
          options: { all?: boolean; home?: boolean; org?: string },
          cmd: Command
        ) => {
          const fmt = getFormatOptions(cmd);

          const configService = new ConfigService();
          await configService.load();

          const workers = configService.listWorkers();
          const homeDir = options.home ? getHooxHome() : undefined;

          // -------------------------------------------------------------------
          // Mode 1: No name, no --all  →  list clone status
          // -------------------------------------------------------------------
          if (!options.all && !name) {
            const repoBase = options.org
              ? `https://github.com/${options.org}`
              : await resolveRepoBase();

            const statuses = await buildStatusList(
              configService,
              repoBase,
              homeDir
            );

            if (fmt.json) {
              formatJson(statuses, fmt);
              return;
            }

            if (fmt.quiet) {
              for (const s of statuses) {
                process.stdout.write(
                  `${s.worker}: ${s.cloned ? "cloned" : "not cloned"}\n`
                );
              }
              return;
            }

            const rows = statuses.map((s) => ({
              Worker: s.worker,
              Status: s.cloned ? "cloned" : "not cloned",
              Location: options.home ? "$HOME/.hoox/workers" : "workers/",
              Repo: s.repo ?? "-",
            }));
            formatTable(rows, fmt);
            return;
          }

          // -------------------------------------------------------------------
          // Mode 2: --all
          // -------------------------------------------------------------------
          if (options.all) {
            if (workers.length === 0) {
              formatSuccess("No workers defined in wrangler.jsonc", fmt);
              return;
            }

            const repoBase = options.org
              ? `https://github.com/${options.org}`
              : await resolveRepoBase();

            const s = spinner();
            const cloneTimer = startTimer();
            const location = options.home ? "$HOME/.hoox/workers" : "workers/";
            s.start(`Cloning ${workers.length} worker(s) to ${location}...`);

            const results: CloneStatus[] = [];

            for (let i = 0; i < workers.length; i++) {
              const name = workers[i];
              const workerConfig = configService.getWorker(name);
              if (!workerConfig) continue;

              // Adjust path if homeDir is specified
              const checkPath = homeDir
                ? `${homeDir}/workers/${workerConfig.path.replace(/^workers\//, "")}`
                : workerConfig.path;

              // Skip already cloned workers
              const alreadyCloned = await isWorkerCloned(checkPath);
              if (alreadyCloned) {
                s.message(
                  `[${i + 1}/${workers.length}] ${icons.info} ${name} already cloned — skipping`
                );
                results.push({
                  worker: name,
                  path: checkPath,
                  cloned: true,
                  repo: getRepoUrl(repoBase, name),
                });
                continue;
              }

              s.message(`[${i + 1}/${workers.length}] Cloning ${name}...`);

              const result = await cloneWorker(
                getRepoUrl(repoBase, name),
                workerConfig.path,
                name,
                process.cwd(),
                homeDir
              );
              results.push(result);

              if (result.cloned) {
                s.message(
                  `[${i + 1}/${workers.length}] ${icons.success} ${name} cloned`
                );
              } else {
                s.message(
                  `[${i + 1}/${workers.length}] ${icons.error} ${name} failed: ${result.error}`
                );
              }
            }

            // Run submodule update after all clones
            try {
              s.message("Updating submodules...");
              await updateSubmodules(process.cwd());
            } catch (updateErr) {
              const msg =
                updateErr instanceof Error
                  ? updateErr.message
                  : String(updateErr);
              s.message(`Warning: submodule update failed: ${msg}`);
            }

            const succeeded = results.filter((r) => r.cloned).length;
            const failed = results.filter((r) => !r.cloned).length;

            if (failed > 0) {
              s.stop(
                `Clone complete: ${succeeded} succeeded, ${failed} failed (${formatDuration(cloneTimer.ms())})`
              );
              process.exitCode = ExitCode.ERROR;
            } else {
              s.stop(
                `All ${succeeded} worker(s) cloned successfully (${formatDuration(cloneTimer.ms())})`
              );
            }

            // Print summary table (unless quiet)
            if (!fmt.quiet) {
              const rows = results.map((r) => ({
                Worker: r.worker,
                Status: r.cloned ? "cloned" : "failed",
                Location: options.home ? "$HOME/.hoox/workers" : "workers/",
                Repo: r.repo ?? "-",
              }));
              formatTable(rows, { json: fmt.json, quiet: false });
            }

            return;
          }

          // -------------------------------------------------------------------
          // Mode 3: <name>  —  clone a single worker
          // -------------------------------------------------------------------
          if (name) {
            const workerConfig = configService.getWorker(name);

            if (!workerConfig) {
              formatError(
                new CLIError(
                  `Worker "${name}" not found in wrangler.jsonc`,
                  ExitCode.ERROR
                ),
                fmt
              );
              process.exitCode = ExitCode.ERROR;
              return;
            }

            // Adjust path if homeDir is specified
            const checkPath = homeDir
              ? `${homeDir}/workers/${workerConfig.path.replace(/^workers\//, "")}`
              : workerConfig.path;

            // Already cloned → early exit with success
            const alreadyCloned = await isWorkerCloned(checkPath);
            if (alreadyCloned) {
              formatSuccess(
                `Worker "${name}" is already cloned at ${checkPath}`,
                fmt
              );
              return;
            }

            const repoBase = options.org
              ? `https://github.com/${options.org}`
              : await resolveRepoBase();

            const s = spinner();
            const singleTimer = startTimer();
            const location = options.home ? "$HOME/.hoox/workers" : "workers/";
            s.start(`Cloning ${name} to ${location}...`);

            const result = await cloneWorker(
              getRepoUrl(repoBase, name),
              workerConfig.path,
              name,
              process.cwd(),
              homeDir
            );

            if (result.cloned) {
              // Update submodules after single clone too
              try {
                s.message("Updating submodules...");
                await updateSubmodules(process.cwd());
              } catch {
                // Non-fatal — the clone itself succeeded
              }

              s.stop(
                `Successfully cloned ${name} (${formatDuration(singleTimer.ms())})`
              );
              const locationText = options.home
                ? " at $HOME/.hoox/workers"
                : "";
              formatSuccess(
                `Cloned ${name}${locationText} from ${result.repo}`,
                fmt
              );
            } else {
              s.stop(
                `Failed to clone ${name} (${formatDuration(singleTimer.ms())})`
              );
              formatError(
                new CLIError(
                  `Failed to clone "${name}": ${result.error}`,
                  ExitCode.ERROR
                ),
                fmt
              );
              process.exitCode = ExitCode.ERROR;
            }

            return;
          }
        },
        { service: "clone" }
      )
    );
}
