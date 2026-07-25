import path from "node:path";
import { ConfigService } from "../config/index.js";
import type {
  WranglerResult,
  DeployResult,
  DevResult,
  VersionEntry,
} from "./types.js";

/**
 * CloudflareService wraps the `wrangler` CLI via Bun.spawn for all
 * Cloudflare operations: deploy, dev, D1, KV, R2, Queues, Secrets, DNS.
 *
 * Every public method returns a {@link WranglerResult} discriminated union
 * so callers handle errors explicitly without try/catch.
 *
 * Supports an optional Hoox home directory (`homeDir`) for resolving
 * worker paths from `$HOME/.hoox/workers/<name>` instead of the current
 * working directory. When `homeDir` is provided, worker paths are resolved
 * via `ConfigService.getWorkerPath()` for consistent path resolution.
 *
 * @example
 * ```ts
 * const cf = new CloudflareService();
 * const result = await cf.whoami();
 * if (result.ok) {
 *   console.log(result.value);
 * } else {
 *   console.error(result.error);
 * }
 * ```
 *
 * @example
 * ```ts
 * // With home directory resolution
 * const cf = new CloudflareService(undefined, "/home/user");
 * await cf.deploy("workers/hoox-worker");
 * // Resolves to: /home/user/.hoox/workers/hoox
 * ```
 */
export class CloudflareService {
  private readonly cwd: string;
  private readonly homeDir: string | undefined;
  private readonly configService: ConfigService | undefined;

  constructor(cwd?: string, homeDir?: string, configService?: ConfigService) {
    this.cwd = cwd ?? process.cwd();
    this.homeDir = homeDir;
    // If a homeDir is provided without a configService, create one internally
    this.configService =
      configService ??
      (this.homeDir ? new ConfigService(undefined, this.homeDir) : undefined);
  }

  // ---------------------------------------------------------------------------
  // Private helper
  // ---------------------------------------------------------------------------

  /**
   * Resolve a worker path using home directory resolution when available.
   *
   * When `configService` or `homeDir` is configured, worker paths are
   * resolved from `$HOME/.hoox/workers/<name>` to support cloned repos
   * installed at the home location.
   *
   * Falls back to `path.resolve(this.cwd, workerPath)` for backward
   * compatibility when no home directory is configured.
   */
  private resolveWorkerPath(workerPath: string): string {
    if (this.configService) {
      const workerName = path.basename(workerPath);
      return this.configService.getWorkerPath(workerName);
    }
    if (this.homeDir) {
      const workerName = path.basename(workerPath);
      return path.join(this.homeDir, ".hoox", "workers", workerName);
    }
    return path.resolve(this.cwd, workerPath);
  }

  /**
   * Spawns `wrangler` with the given arguments, captures stdout/stderr,
   * and returns a typed result.
   *
   * Security: never passes secrets via CLI args — methods like
   * {@link secretPut} pipe values through stdin instead.
   */
  private async runWrangler(
    args: string[],
    cwd?: string
  ): Promise<WranglerResult<string>> {
    try {
      const proc = Bun.spawn(["wrangler", ...args], {
        cwd: cwd ?? this.cwd,
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      if (exitCode === 0) {
        return { ok: true, value: stdout.trim() };
      }

      return {
        ok: false,
        error: stderr.trim() || `wrangler exited with code ${exitCode}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Detect ENOENT (binary not on PATH) and surface a hint alongside the
      // error string. Callers can show this to the user via the standard
      // error-formatting pipeline.
      const hint = /ENOENT|not found/i.test(message)
        ? "Install wrangler with `bun add -g wrangler` (or `npm i -g wrangler`), then run `wrangler login`."
        : undefined;
      return {
        ok: false,
        error: hint
          ? `Failed to spawn wrangler: ${message}\n↳ hint: ${hint}`
          : `Failed to spawn wrangler: ${message}`,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Auth / identity
  // ---------------------------------------------------------------------------

  /** Runs `wrangler whoami` to verify Cloudflare authentication. */
  async whoami(): Promise<WranglerResult<string>> {
    return this.runWrangler(["whoami"]);
  }

  // ---------------------------------------------------------------------------
  // Deploy
  // ---------------------------------------------------------------------------

  /**
   * Deploys a worker via `wrangler deploy`.
   *
   * @param workerPath - Relative or absolute path to the worker directory
   *                     (must contain wrangler.jsonc).
   * @param env         - Optional Cloudflare environment (e.g. "production").
   */
  async deploy(
    workerPath: string,
    env?: string
  ): Promise<WranglerResult<DeployResult>> {
    const resolvedPath = this.resolveWorkerPath(workerPath);
    const args = ["deploy"];

    if (env) {
      args.push("--env", env);
    }

    const result = await this.runWrangler(args, resolvedPath);

    if (!result.ok) {
      return result;
    }

    // Extract the worker URL from deploy output.
    // wrangler prints lines like:  https://name.subdomain.workers.dev
    const url = this.extractUrl(result.value);

    // Parse verbose output for metrics
    const output = result.value;
    const deployResult: DeployResult = { url, rawOutput: output };

    // Extract worker name from path
    const pathParts = workerPath.split("/");
    deployResult.name = pathParts[pathParts.length - 1];

    // Extract bundle size (e.g., "Total Upload: 7102.32 KiB / gzip: 1493.05 KiB")
    const sizeMatch = output.match(/Total Upload:\s*([\d.]+)\s*([KMGT]?i?B)/i);
    if (sizeMatch) {
      deployResult.size = `${sizeMatch[1]} ${sizeMatch[2]}`;
    }

    // Extract startup time (e.g., "Worker Startup Time: 37 ms")
    const startupMatch = output.match(/Worker Startup Time:\s*(\d+)\s*ms/i);
    if (startupMatch) {
      deployResult.startupTime = `${startupMatch[1]} ms`;
    }

    // Extract version ID (e.g., "Current Version ID: 6a6efd9b-64cf-422b-8b10-84d9c2c6b2d3")
    const versionMatch = output.match(
      /Current Version ID:\s*([a-f0-9-]{36,})/i
    );
    if (versionMatch) {
      deployResult.versionId = versionMatch[1];
    }

    return { ok: true, value: deployResult };
  }

  // ---------------------------------------------------------------------------
  // Versions (deployment history / rollback)
  // ---------------------------------------------------------------------------

  /**
   * Lists deployment versions for a worker (`wrangler versions list --json`).
   * Returns parsed VersionEntry[] with id, number, created_on, author, source.
   */
  async versionsList(
    workerName: string
  ): Promise<WranglerResult<VersionEntry[]>> {
    const result = await this.runWrangler([
      "versions",
      "list",
      "--name",
      workerName,
      "--json",
    ]);

    if (!result.ok) {
      return result;
    }

    try {
      const parsed: unknown = JSON.parse(result.value);
      if (!Array.isArray(parsed)) {
        return {
          ok: false,
          error: `Expected array from wrangler versions list, got ${typeof parsed}`,
        };
      }

      const versions: VersionEntry[] = parsed.map(
        (v: Record<string, unknown>) => ({
          id: String(v.id ?? ""),
          number: typeof v.number === "number" ? v.number : undefined,
          created_on:
            typeof v.metadata === "object" && v.metadata !== null
              ? String((v.metadata as Record<string, unknown>).created_on ?? "")
              : undefined,
          author:
            typeof v.metadata === "object" && v.metadata !== null
              ? String((v.metadata as Record<string, unknown>).author ?? "")
              : undefined,
          message:
            typeof v.metadata === "object" && v.metadata !== null
              ? String((v.metadata as Record<string, unknown>).message ?? "")
              : undefined,
          source:
            typeof v.metadata === "object" && v.metadata !== null
              ? String((v.metadata as Record<string, unknown>).source ?? "")
              : undefined,
        })
      );

      return { ok: true, value: versions };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: `Failed to parse versions list: ${message}`,
      };
    }
  }

  /**
   * Rolls back a worker to a specific version
   * (`wrangler versions rollback --name <worker> --version-id <id>`).
   */
  async versionsRollback(
    workerName: string,
    versionId: string
  ): Promise<WranglerResult<string>> {
    return this.runWrangler([
      "versions",
      "rollback",
      "--name",
      workerName,
      "--version-id",
      versionId,
    ]);
  }

  // ---------------------------------------------------------------------------
  // Dev
  // ---------------------------------------------------------------------------

  /**
   * Starts a local dev server via `wrangler dev`.
   *
   * Note: `wrangler dev` runs until killed (Ctrl+C). This method spawns the
   * process but does NOT wait for it to exit — it resolves immediately with
   * the configured port. The caller is responsible for process lifecycle.
   *
   * @param workerPath - Path to the worker directory.
   * @param port       - Dev server port (default: 8787).
   */
  async dev(
    workerPath: string,
    port?: number
  ): Promise<WranglerResult<DevResult>> {
    const devPort = port ?? 8787;
    const resolvedPath = this.resolveWorkerPath(workerPath);

    try {
      Bun.spawn(["wrangler", "dev", "--port", String(devPort)], {
        cwd: resolvedPath,
        stdout: "pipe",
        stderr: "pipe",
      });

      // Dev runs indefinitely — return immediately with the known port.
      return { ok: true, value: { port: devPort } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Failed to start dev server: ${message}` };
    }
  }

  // ---------------------------------------------------------------------------
  // Logs
  // ---------------------------------------------------------------------------

  /** Tails live logs via `wrangler tail <workerName>`. */
  async tail(workerName: string): Promise<WranglerResult<string>> {
    return this.runWrangler(["tail", workerName]);
  }

  // ---------------------------------------------------------------------------
  // D1
  // ---------------------------------------------------------------------------

  /** Lists all D1 databases (`wrangler d1 list --json`). */
  async d1List(): Promise<WranglerResult<string>> {
    return this.runWrangler(["d1", "list", "--json"]);
  }

  /** Creates a D1 database (`wrangler d1 create <name>`). */
  async d1Create(name: string): Promise<WranglerResult<string>> {
    return this.runWrangler(["d1", "create", name]);
  }

  /** Deletes a D1 database (`wrangler d1 delete <name>`). */
  async d1Delete(name: string): Promise<WranglerResult<string>> {
    return this.runWrangler(["d1", "delete", name]);
  }

  /**
   * Runs a SQL query on a D1 database (`wrangler d1 execute`).
   *
   * Returns the JSON result array (the tail of wrangler's stdout).
   * Wrangler's stdout has a noisy prefix (`⛅️ wrangler 4.98.0 (update
   * available 4.105.0)`, `Resource location: remote`, etc.) before
   * the JSON. Callers that JSON.parse the result need the pure
   * JSON, so we extract the trailing array here.
   *
   * For backward compat with code that expects the full stdout
   * (none in the current codebase), this could expose a separate
   * `d1ExecuteRaw` method. As of 0.9.2 only this method exists.
   */
  async d1Execute(
    name: string,
    sql: string,
    remote: boolean = true
  ): Promise<WranglerResult<string>> {
    const args = ["d1", "execute", name, "--command", sql];
    if (remote) args.push("--remote");
    const result = await this.runWrangler(args);
    if (!result.ok) return result;
    const extracted = extractJsonArray(result.value);
    if (extracted === null) {
      return {
        ok: false,
        error: `wrangler d1 execute returned non-JSON output: ${result.value.slice(0, 200)}`,
      };
    }
    return { ok: true, value: extracted };
  }

  // ---------------------------------------------------------------------------
  // KV (wrangler v4+: use `kv namespace` instead of deprecated `kv:namespace`)
  // ---------------------------------------------------------------------------

  /** Lists all KV namespaces (`wrangler kv namespace list`). */
  async kvList(): Promise<WranglerResult<string>> {
    return this.runWrangler(["kv", "namespace", "list"]);
  }

  /** Creates a KV namespace (`wrangler kv namespace create <name>`). */
  async kvCreate(name: string): Promise<WranglerResult<string>> {
    return this.runWrangler(["kv", "namespace", "create", name]);
  }

  /** Deletes a KV namespace (`wrangler kv namespace delete --namespace-id <id>`). */
  async kvDelete(id: string): Promise<WranglerResult<string>> {
    return this.runWrangler([
      "kv",
      "namespace",
      "delete",
      "--namespace-id",
      id,
    ]);
  }

  // ---------------------------------------------------------------------------
  // R2
  // ---------------------------------------------------------------------------

  /** Lists all R2 buckets (`wrangler r2 bucket list`). */
  async r2List(): Promise<WranglerResult<string>> {
    return this.runWrangler(["r2", "bucket", "list"]);
  }

  /** Creates an R2 bucket (`wrangler r2 bucket create <name>`). */
  async r2Create(name: string): Promise<WranglerResult<string>> {
    return this.runWrangler(["r2", "bucket", "create", name]);
  }

  /** Deletes an R2 bucket (`wrangler r2 bucket delete <name>`). */
  async r2Delete(name: string): Promise<WranglerResult<string>> {
    return this.runWrangler(["r2", "bucket", "delete", name]);
  }

  // ---------------------------------------------------------------------------
  // Queues
  // ---------------------------------------------------------------------------

  /** Lists all queues (`wrangler queues list`). */
  async queueList(): Promise<WranglerResult<string>> {
    return this.runWrangler(["queues", "list"]);
  }

  /** Creates a queue (`wrangler queues create <name>`). */
  async queueCreate(name: string): Promise<WranglerResult<string>> {
    return this.runWrangler(["queues", "create", name]);
  }

  /** Deletes a queue (`wrangler queues delete <name>`). */
  async queueDelete(name: string): Promise<WranglerResult<string>> {
    return this.runWrangler(["queues", "delete", name]);
  }

  // ---------------------------------------------------------------------------
  // Vectorize
  // ---------------------------------------------------------------------------

  /** Lists all vectorize indexes (`wrangler vectorize list --json`). */
  async vectorizeList(): Promise<WranglerResult<string>> {
    return this.runWrangler(["vectorize", "list", "--json"]);
  }

  /** Creates a vectorize index (`wrangler vectorize create <name> --dimensions=768 --metric=cosine`). */
  async vectorizeCreate(
    name: string,
    dimensions: number = 768,
    metric: string = "cosine"
  ): Promise<WranglerResult<string>> {
    return this.runWrangler([
      "vectorize",
      "create",
      name,
      "--dimensions",
      String(dimensions),
      "--metric",
      metric,
    ]);
  }

  /** Deletes a vectorize index (`wrangler vectorize delete <name>`). */
  async vectorizeDelete(name: string): Promise<WranglerResult<string>> {
    return this.runWrangler(["vectorize", "delete", name]);
  }

  // ---------------------------------------------------------------------------
  // Analytics
  // ---------------------------------------------------------------------------

  /** Lists all analytics datasets (`wrangler analytics dataset list`). */
  async analyticsList(): Promise<WranglerResult<string>> {
    return this.runWrangler(["analytics", "dataset", "list"]);
  }

  /**
   * Returns a helpful error — wrangler does not support creating analytics
   * datasets from the CLI. Users must create them via the Cloudflare Dashboard.
   */
  async analyticsCreate(_name: string): Promise<WranglerResult<string>> {
    return {
      ok: false,
      error:
        `Analytics datasets cannot be created via wrangler. ` +
        `Please use the Cloudflare Dashboard: ` +
        `https://dash.cloudflare.com/?to=/:account/analytics`,
    };
  }

  // ---------------------------------------------------------------------------
  // Secrets
  // ---------------------------------------------------------------------------

  /**
   * Lists secrets for a worker (`wrangler secret list --name <workerName>`).
   *
   * Wrangler's stdout is not pure JSON: depending on the wrangler
   * version it may prepend a "There is a newer version of Wrangler
   * available" notice (or other upgrade/version warnings) to stdout
   * before the JSON array. As of wrangler 4.98 the array is always
   * valid JSON in the tail of stdout, so we extract the JSON array
   * (first '[' to last matching ']') before returning.
   *
   * The caller (setup-service.verifySetup) JSON.parses the result,
   * so it must be a valid JSON string. If extraction fails, the
   * caller will see a "parse error" — the fix here is to surface
   * the raw stdout in `error` so the bug is debuggable.
   */
  async secretList(workerName: string): Promise<WranglerResult<string>> {
    const result = await this.runWrangler([
      "secret",
      "list",
      "--name",
      workerName,
    ]);
    if (!result.ok) return result;
    const extracted = extractJsonArray(result.value);
    if (extracted === null) {
      return {
        ok: false,
        error: `wrangler secret list returned non-JSON output: ${result.value.slice(0, 200)}`,
      };
    }
    return { ok: true, value: extracted };
  }

  /**
   * Sets a secret for a worker via `wrangler secret put`.
   *
   * **Security**: the secret value is piped through stdin (never passed as a
   * CLI argument) to prevent exposure in `ps` output and shell history.
   */
  async secretPut(
    workerName: string,
    secretName: string,
    value: string
  ): Promise<WranglerResult<string>> {
    try {
      const proc = Bun.spawn(
        ["wrangler", "secret", "put", secretName, "--name", workerName],
        {
          cwd: this.cwd,
          stdout: "pipe",
          stderr: "pipe",
          stdin: "pipe",
        }
      );

      // Pipe the secret value through stdin — never via CLI args.
      proc.stdin.write(value + "\n");
      proc.stdin.end();

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      if (exitCode === 0) {
        return { ok: true, value: stdout.trim() };
      }

      return {
        ok: false,
        error: stderr.trim() || `wrangler exited with code ${exitCode}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Failed to set secret: ${message}` };
    }
  }

  /** Deletes a secret from a worker (`wrangler secret delete <secretName> --name <workerName>`). */
  async secretDelete(
    workerName: string,
    secretName: string
  ): Promise<WranglerResult<string>> {
    return this.runWrangler([
      "secret",
      "delete",
      secretName,
      "--name",
      workerName,
    ]);
  }

  // ---------------------------------------------------------------------------
  // DNS / Zones
  // ---------------------------------------------------------------------------

  /**
   * Lists all Cloudflare zones via the Cloudflare API.
   *
   * Note: `wrangler zones list` was removed in wrangler v4.x, so this method
   * now uses the Cloudflare REST API directly. Requires CLOUDFLARE_API_TOKEN
   * environment variable to be set.
   */
  async zonesList(): Promise<WranglerResult<string>> {
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!token) {
      return {
        ok: false,
        error:
          "CLOUDFLARE_API_TOKEN environment variable is not set. Set it or run `wrangler login`.",
      };
    }

    try {
      const response = await fetch(
        "https://api.cloudflare.com/client/v4/zones?per_page=50",
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const json = (await response.json()) as {
        success: boolean;
        result: Array<{ id: string; name: string }>;
        errors: Array<{ message: string }>;
      };

      if (!response.ok || !json.success) {
        const errorMsg =
          json.errors?.map((e) => e.message).join("; ") ||
          `HTTP ${response.status}`;
        return { ok: false, error: `Failed to list zones: ${errorMsg}` };
      }

      // Format output to match legacy wrangler zones list format:
      // "zone-name (zone-id)"
      const lines = json.result.map((z) => `${z.name} (${z.id})`);
      return { ok: true, value: lines.join("\n") };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Cloudflare API request failed: ${message}` };
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Extracts a URL from wrangler deploy output.
   * wrangler v4+ prints lines like:  https://name.subdomain.workers.dev
   */
  private extractUrl(stdout: string): string | undefined {
    // Match any https:// URL ending in workers.dev or cloudflareworkers.com
    // Handles direct (name.workers.dev), subdomain (name.acme.workers.dev),
    // and any other URL pattern wrangler v4+ might produce.
    // Also try to match URLs at the start of a line.
    for (const line of stdout.split("\n")) {
      const trimmed = line.trim();
      // wrangler v4+ outputs URLs like: https://name.subdomain.workers.dev
      // Possibly preceded by "Published" or "Uploaded"
      const match = trimmed.match(
        /(https?:\/\/[^\s]+(?:workers\.dev|cloudflareworkers\.com)[^\s]*)/
      );
      if (match) return match[1];
    }
    return undefined;
  }
}

/**
 * Extract the first top-level JSON array from a string that may
 * contain leading noise (e.g. "There is a newer version of Wrangler
 * available..." warnings that wrangler prints to stdout before the
 * actual JSON payload). Used by `secretList` to recover the
 * `[{"name":"..."}]` array from wrangler's mixed stdout.
 *
 * Returns null if no valid JSON array is found. The extracted
 * substring is JSON.parse'd by the caller.
 */
export function extractJsonArray(raw: string): string | null {
  const first = raw.indexOf("[");
  if (first === -1) return null;
  // Walk forward tracking string literals and bracket depth to find
  // the matching closing ']'. Wrangler's output is well-formed JSON
  // so a simple depth counter suffices as long as we skip over
  // quoted strings.
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = first; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return raw.slice(first, i + 1);
    }
  }
  return null;
}
