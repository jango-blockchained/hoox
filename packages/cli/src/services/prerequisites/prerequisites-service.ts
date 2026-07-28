/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PrerequisitesService checks runtime prerequisites before dev commands.
 *
 * Currently checks wrangler version against a known minimum.
 */

interface WranglerVersionCheck {
  outdated: boolean;
  current?: string;
  minimum?: string;
}

/** Result of a single tool/account prerequisite check. */
export interface PrerequisiteCheck {
  /** Display name (e.g. "Bun", "Git", "Wrangler CLI"). */
  name: string;
  /** Whether the check passed. */
  passed: boolean;
  /** Tool category for grouping: "tool", "account", "repository". */
  category: "tool" | "account" | "repository";
  /** The installed version (or "not found"). */
  version: string;
  /** The minimum required version (or "-" if not versioned). */
  required: string;
  /** How to install/fix if the check failed. */
  hint?: string;
}

/** Aggregated result from running all checks. */
export interface PrerequisitesReport {
  checks: PrerequisiteCheck[];
  allPassed: boolean;
}

export class PrerequisitesService {
  private readonly MINIMUM_WRANGLER = "3.88.0";

  /**
   * Check if wrangler is installed and meets the minimum version.
   *
   * Returns `{ outdated: true }` when wrangler is found but below minimum.
   * Returns `{ outdated: false }` when version meets or exceeds minimum.
   * Returns `{ outdated: false }` when wrangler is not installed (advisory only).
   */
  async checkWranglerVersion(): Promise<WranglerVersionCheck> {
    try {
      const proc = Bun.spawn(["wrangler", "--version"], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        // wrangler not found or error — advisory, don't block
        return { outdated: false };
      }

      // wrangler --version output: "wrangler 3.87.0" or "3.87.0"
      const raw = stdout.trim();
      const match = raw.match(/(\d+\.\d+\.\d+)/);
      if (!match) {
        return { outdated: false };
      }

      const current = match[1];
      const meetsMin = this.satisfies(current, this.MINIMUM_WRANGLER);

      return {
        outdated: !meetsMin,
        current,
        minimum: this.MINIMUM_WRANGLER,
      };
    } catch {
      // wrangler not installed — advisory, don't block
      return { outdated: false };
    }
  }

  /**
   * Simple semver satisfies check: "3.87.0" satisfies "3.88.0" is false.
   * Returns true if `current >= minimum`.
   */
  private satisfies(current: string, minimum: string): boolean {
    const a = current.split(".").map(Number);
    const b = minimum.split(".").map(Number);

    for (let i = 0; i < 3; i++) {
      if ((a[i] ?? 0) > (b[i] ?? 0)) return true;
      if ((a[i] ?? 0) < (b[i] ?? 0)) return false;
    }
    return true;
  }

  /**
   * Check Bun version (minimum 1.2).
   * Runs `bun --version` and parses the output.
   */
  async checkBun(): Promise<PrerequisiteCheck> {
    const base = { name: "Bun", category: "tool" as const, required: ">=1.2" };
    try {
      const proc = Bun.spawn(["bun", "--version"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = await new Response(proc.stdout).text();
      const version = stdout.trim();
      const [major, minor] = version.split(".").map(Number);
      const passed = (major ?? 0) >= 1 && (minor ?? 0) >= 2;
      return {
        ...base,
        passed,
        version: version || "not found",
        hint: passed ? undefined : "Install: curl -fsSL https://bun.sh | bash",
      };
    } catch {
      return {
        ...base,
        passed: false,
        version: "not found",
        hint: "Install: curl -fsSL https://bun.sh | bash",
      };
    }
  }

  /**
   * Check Git version (minimum 2.40).
   * Runs `git --version` and parses the output.
   */
  async checkGit(): Promise<PrerequisiteCheck> {
    const base = { name: "Git", category: "tool" as const, required: ">=2.40" };
    try {
      const proc = Bun.spawn(["git", "--version"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = await new Response(proc.stdout).text();
      const match = stdout.match(/(\d+\.\d+)/);
      const version = match ? match[1] : "unknown";
      const [major, minor] = version.split(".").map(Number);
      const passed = (major ?? 0) >= 2 && (minor ?? 0) >= 40;
      return {
        ...base,
        passed,
        version,
        hint: passed ? undefined : "Install: apt install git",
      };
    } catch {
      return {
        ...base,
        passed: false,
        version: "not found",
        hint: "Install: apt install git",
      };
    }
  }

  /**
   * Check Node.js version — advisory only (minimum 18).
   * Runs `node --version` if available, skips gracefully if not installed.
   */
  async checkNode(): Promise<PrerequisiteCheck> {
    const base = {
      name: "Node.js",
      category: "tool" as const,
      required: ">=18 (optional)",
    };
    try {
      const proc = Bun.spawn(["node", "--version"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = await new Response(proc.stdout).text();
      const version = stdout.trim().replace(/^v/, "");
      const [major] = version.split(".").map(Number);
      const passed = (major ?? 0) >= 18;
      return {
        ...base,
        passed,
        version: version || "not found",
        hint: passed ? undefined : "Install: nvm or https://nodejs.org",
      };
    } catch {
      return {
        ...base,
        passed: true,
        version: "not installed",
        hint: "Optional — not required when using Bun",
      };
    }
  }

  /**
   * Check wrangler CLI version using existing checkWranglerVersion().
   * Delegates to the existing method to avoid duplicating semver logic.
   */
  async checkWrangler(): Promise<PrerequisiteCheck> {
    const base = {
      name: "Wrangler CLI",
      category: "tool" as const,
      required: `>=${this.MINIMUM_WRANGLER}`,
    };
    const result = await this.checkWranglerVersion();
    if (!result.current) {
      return {
        ...base,
        passed: false,
        version: "not found",
        hint: "Install: bun add -g wrangler",
      };
    }
    return {
      ...base,
      passed: !result.outdated,
      version: result.current,
      hint: result.outdated
        ? `Update: bun add -g wrangler@latest (${result.current} < ${result.minimum})`
        : undefined,
    };
  }

  /**
   * Check Cloudflare authentication via wrangler whoami.
   * Verifies the CLI is authenticated and extracts the user email.
   */
  async checkCloudflareAuth(): Promise<PrerequisiteCheck> {
    const base = {
      name: "Cloudflare Auth",
      category: "account" as const,
      required: "wrangler whoami",
    };
    try {
      const proc = Bun.spawn(["wrangler", "whoami"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      const passed = exitCode === 0 && !stdout.includes("not authenticated");
      const email = stdout.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0];
      return {
        ...base,
        passed,
        version: email ? `Authenticated as ${email}` : "not authenticated",
        hint: passed ? undefined : "Run: wrangler login",
      };
    } catch {
      return {
        ...base,
        passed: false,
        version: "not authenticated",
        hint: "Run: wrangler login",
      };
    }
  }

  /**
   * Verify the authenticated token actually has the scopes Hoox needs.
   *
   * `wrangler whoami` only proves *an* identity is logged in — it does NOT
   * prove the token can read D1/KV/R2/Queues. A token scoped to the wrong
   * account, or missing `Account > D1 > Edit` / `KV > Edit`, will pass
   * `whoami` but fail every `hoox setup` / `hoox infra` call with a raw
   * 4xx. This check probes a read-only Cloudflare API (list D1 databases)
   * to catch that class of failure *before* the user runs a deploy.
   */
  async checkCloudflareTokenScope(): Promise<PrerequisiteCheck> {
    const base = {
      name: "Cloudflare Token Scope",
      category: "account" as const,
      required: "D1/KV/R2/Queues: Edit",
    };
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!token) {
      // No explicit token — wrangler login session may still work. Advisory.
      return {
        ...base,
        passed: true,
        version: "using wrangler login session",
        hint: "If deploys fail with 403, set CLOUDFLARE_API_TOKEN with D1/KV/R2/Queues:Edit",
      };
    }
    try {
      const response = await fetch(
        "https://api.cloudflare.com/client/v4/accounts",
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );
      const json = (await response.json()) as {
        success: boolean;
        errors?: Array<{ code: number; message: string }>;
      };
      if (response.ok && json.success) {
        return {
          ...base,
          passed: true,
          version: "token has account:read",
        };
      }
      const errMsg = json.errors?.[0]?.message ?? `HTTP ${response.status}`;
      return {
        ...base,
        passed: false,
        version: errMsg,
        hint: "Token lacks required scopes. Recreate it with: Account > Workers Scripts > Edit, D1 > Edit, KV > Edit, R2 > Edit, Queues > Edit, AI > Read",
      };
    } catch {
      return {
        ...base,
        passed: false,
        version: "token scope check failed (network error)",
        hint: "Check network connectivity and CLOUDFLARE_API_TOKEN value",
      };
    }
  }

  /**
   * Check Docker availability (optional — always passes even if not found).
   * Also checks `docker compose` availability separately.
   */
  async checkDocker(): Promise<PrerequisiteCheck> {
    const base = {
      name: "Docker",
      category: "tool" as const,
      required: "optional",
    };
    try {
      const proc = Bun.spawn(["docker", "--version"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = await new Response(proc.stdout).text();
      const version = stdout
        .trim()
        .replace(/^Docker version /, "")
        .replace(/,.*$/, "");
      let composeVersion = "";
      try {
        const composeProc = Bun.spawn(["docker", "compose", "version"], {
          stdout: "pipe",
          stderr: "pipe",
        });
        composeVersion = (await new Response(composeProc.stdout).text()).trim();
      } catch {
        /* compose optional */
      }
      return {
        ...base,
        passed: true,
        version:
          version + (composeVersion ? ` (compose: yes)` : " (compose: no)"),
      };
    } catch {
      return {
        ...base,
        passed: true,
        version: "not installed",
        hint: "Optional — used for Docker dev runtime",
      };
    }
  }

  /**
   * Check repository integrity: wrangler.jsonc exists, .env file present, submodules initialized.
   */
  async checkRepository(): Promise<PrerequisiteCheck> {
    const base = {
      name: "Repository",
      category: "repository" as const,
      required: "valid",
    };
    try {
      const wranglerExists = await Bun.file("wrangler.jsonc").exists();
      const envExists =
        (await Bun.file(".env.local").exists()) ||
        (await Bun.file(".env.example").exists());
      const issues: string[] = [];
      if (!wranglerExists) issues.push("wrangler.jsonc not found");
      if (!envExists) issues.push("no .env.local or .env.example found");
      let submoduleOk = false;
      try {
        const proc = Bun.spawn(["git", "submodule", "status"], {
          stdout: "pipe",
          stderr: "pipe",
        });
        const stdout = await new Response(proc.stdout).text();
        submoduleOk = !stdout.startsWith("-");
      } catch {
        /* not a git repo */
      }
      const passed = wranglerExists && issues.length === 0;
      return {
        ...base,
        passed,
        version:
          issues.length > 0
            ? issues.join("; ")
            : submoduleOk
              ? "OK"
              : "submodules may need init",
        hint: passed ? undefined : "Run: hoox init or hoox clone --all",
      };
    } catch {
      return {
        ...base,
        passed: false,
        version: "check failed",
        hint: "Check repository structure",
      };
    }
  }

  async runAll(filterTool?: string): Promise<PrerequisitesReport> {
    const allChecks: Promise<PrerequisiteCheck>[] = [
      this.checkBun(),
      this.checkGit(),
      this.checkNode(),
      this.checkWrangler(),
      this.checkCloudflareAuth(),
      this.checkCloudflareTokenScope(),
      this.checkDocker(),
      this.checkRepository(),
    ];

    let checks = await Promise.all(allChecks);

    if (filterTool) {
      const lower = filterTool.toLowerCase();
      checks = checks.filter((c) => c.name.toLowerCase() === lower);
    }

    return {
      checks,
      allPassed: checks.every((c) => c.passed),
    };
  }
}
