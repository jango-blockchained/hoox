/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DockerService wraps Docker Compose operations for local development.
 *
 * Provides availability checks, compose file detection, and compose up/down.
 */

interface DockerAvailability {
  docker: boolean;
  compose: boolean;
}

interface ComposeResult {
  ok: boolean;
  error?: string;
}

/**
 * Resolved path to docker-compose.yml in the project root.
 */
const COMPOSE_FILE = "docker-compose.yml";

/**
 * Default maximum time to wait for any docker CLI invocation before
 * failing fast. A hung Docker daemon must not block the CLI forever.
 */
const DEFAULT_PROC_TIMEOUT_MS = 15_000;

export interface DockerServiceOptions {
  cwd?: string;
  /** Maximum ms to wait for a docker CLI invocation. Default 15000. */
  procTimeoutMs?: number;
}

export class DockerService {
  private readonly cwd: string;
  private readonly procTimeoutMs: number;

  constructor(opts: DockerServiceOptions | string = {}) {
    // Back-compat: accept a string cwd as the only argument.
    if (typeof opts === "string") {
      this.cwd = opts;
      this.procTimeoutMs = DEFAULT_PROC_TIMEOUT_MS;
    } else {
      this.cwd = opts.cwd ?? process.cwd();
      this.procTimeoutMs = opts.procTimeoutMs ?? DEFAULT_PROC_TIMEOUT_MS;
    }
  }

  /**
   * Check if Docker and docker-compose are available in PATH.
   *
   * Probes BOTH the `docker` binary (via Bun.which, no subprocess) and the
   * `docker compose` subcommand (via `docker compose version`) so that a
   * missing compose plugin is reported accurately.
   */
  async checkAvailability(): Promise<DockerAvailability> {
    const [dockerOk, composeOk] = await Promise.all([
      this.isBinaryAvailable("docker"),
      this.isSubcommandAvailable("docker", "compose"),
    ]);

    return { docker: dockerOk, compose: composeOk };
  }

  /**
   * Check if docker-compose.yml exists in the project root.
   */
  async composeFileExists(): Promise<boolean> {
    const file = Bun.file(
      this.cwd.endsWith("/")
        ? `${this.cwd}${COMPOSE_FILE}`
        : `${this.cwd}/${COMPOSE_FILE}`
    );
    return file.exists();
  }

  /**
   * Run `docker compose up` for the given profiles.
   *
   * @param profiles  - Compose profiles to activate (e.g. ["workers", "dashboard"]).
   * @param detached  - Run in detached mode (default false, inherits stdout/stderr).
   * @returns ComposeResult with ok=true on success.
   */
  async composeUp(
    profiles: string[],
    detached = false
  ): Promise<ComposeResult> {
    const args = ["compose", "up"];

    if (detached) {
      args.push("-d");
    }

    // `Bun.spawn` env REPLACES the parent environment (does not merge), so we
    // must explicitly spread process.env and only override the keys we need.
    // Without this, PATH / HOME / DOCKER_* / user-set secrets would be
    // stripped and `docker` itself could fail to find its daemon socket.
    // We filter out undefined entries because `process.env` is typed as
    // `string | undefined` but `Bun.spawn` env requires plain `string`.
    const env: Record<string, string> = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined
      )
    );
    if (profiles.length > 0) {
      env.COMPOSE_PROFILES = profiles.join(",");
    }

    try {
      const proc = Bun.spawn(["docker", ...args], {
        cwd: this.cwd,
        stdout: detached ? "pipe" : "inherit",
        stderr: "inherit",
        stdin: "ignore",
        env,
      });

      if (!detached) {
        // For non-detached, inherit stdout/stderr — user sees real-time output.
        // Wait for the process to exit naturally (Ctrl+C or completion).
        const exitCode = await this.withTimeout(proc, "docker compose up");

        if (exitCode === 0) {
          return { ok: true };
        }
        return {
          ok: false,
          error: `docker compose exited with code ${exitCode}`,
        };
      }

      // Detached mode: capture output. `proc.exited` first guarantees the
      // stdout stream has been closed before we read it — avoids a race
      // where the process is still flushing when we try to drain.
      const exitCode = await this.withTimeout(proc, "docker compose up");
      const stdout = await new Response(proc.stdout).text();

      if (exitCode === 0) {
        return { ok: true };
      }
      return {
        ok: false,
        error: stdout.trim() || `docker compose exited with code ${exitCode}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Failed to run docker compose: ${message}` };
    }
  }

  /**
   * Run `docker compose down` to stop running containers.
   *
   * @param profiles  - Compose profiles to target (e.g. ["workers"]). Pass empty array for default.
   */
  async composeDown(profiles: string[] = []): Promise<ComposeResult> {
    // `Bun.spawn` env REPLACES the parent environment (does not merge), so we
    // must explicitly spread process.env and only override the keys we need.
    // Without this, PATH / HOME / DOCKER_* would be stripped and the docker
    // CLI couldn't even find its daemon. We filter out undefined entries
    // because `process.env` is typed as `string | undefined` but
    // `Bun.spawn` env requires plain `string`.
    const env: Record<string, string> = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined
      )
    );
    if (profiles.length > 0) {
      env.COMPOSE_PROFILES = profiles.join(",");
    }

    try {
      const proc = Bun.spawn(["docker", "compose", "down"], {
        cwd: this.cwd,
        stdout: "pipe",
        stderr: "pipe",
        stdin: "ignore",
        env,
      });

      // Wait for the process to fully exit before reading stderr — avoids a
      // race where the stream is still being flushed.
      const exitCode = await this.withTimeout(proc, "docker compose down");
      const stderr = await new Response(proc.stderr).text();

      if (exitCode === 0) {
        return { ok: true };
      }
      return {
        ok: false,
        error:
          stderr.trim() || `docker compose down exited with code ${exitCode}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: `Failed to run docker compose down: ${message}`,
      };
    }
  }

  /**
   * Probe PATH for a binary's availability using Bun.which (no subprocess).
   * Works on minimal images where `which` may not be installed.
   */
  private isBinaryAvailable(binary: string): Promise<boolean> {
    return Promise.resolve(Bun.which(binary) !== null);
  }

  /**
   * Probe whether `<binary> <subcommand>` works by spawning
   * `<binary> <subcommand> version`. Wrapped in a timeout so a hung daemon
   * cannot block the caller.
   */
  private async isSubcommandAvailable(
    binary: string,
    subcommand: string
  ): Promise<boolean> {
    // First verify the binary itself exists.
    if (Bun.which(binary) === null) {
      return false;
    }

    let proc: ReturnType<typeof Bun.spawn>;
    try {
      proc = Bun.spawn([binary, subcommand, "version"], {
        stdout: "pipe",
        stderr: "pipe",
        stdin: "ignore",
      });
    } catch {
      // Binary exists but won't spawn — treat as unavailable.
      return false;
    }

    try {
      const code = await this.withTimeout(proc, `${binary} ${subcommand}`);
      return code === 0;
    } catch {
      return false;
    }
  }

  /**
   * Race a subprocess exit against a timeout. If the timeout fires first,
   * kill the process and throw — the caller converts to a structured error.
   */
  private async withTimeout(
    proc: ReturnType<typeof Bun.spawn>,
    label: string
  ): Promise<number> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        try {
          proc.kill();
        } catch {
          // ignore: process may already be dead
        }
        reject(new Error(`${label} timed out after ${this.procTimeoutMs}ms`));
      }, this.procTimeoutMs);
    });

    try {
      const code = await Promise.race([proc.exited, timeoutPromise]);
      return code;
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }
}
