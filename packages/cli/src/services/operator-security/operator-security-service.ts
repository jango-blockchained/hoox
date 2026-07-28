/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Operator-plane security checks for `hoox doctor --security` and `hoox tunnel check`.
 *
 * Never logs secret values. All probes use injectable fetch for tests.
 */

import {
  buildOperatorAuthHeaders,
  formatConfigPermissionWarning,
  hasOperatorClientCredentials,
  isConfigWorldOrGroupReadable,
  operatorUrl,
  resolveOperatorTransportProfile,
  type OperatorTransportEnv,
  type OperatorTransportProfile,
} from "@jango-blockchained/hoox-shared";

export type SecurityCheckSeverity = "ok" | "warn" | "error" | "info";

export interface SecurityCheckLine {
  id: string;
  severity: SecurityCheckSeverity;
  label: string;
  detail: string;
  /** When true, severity=error should fail doctor --security exit code. */
  hardFail?: boolean;
}

export type ProbeClassification =
  | "ok"
  | "auth_required"
  | "access_gate"
  | "not_found"
  | "network"
  | "unexpected";

export interface OperatorProbeResult {
  url: string;
  status: number | null;
  classification: ProbeClassification;
  detail: string;
  /** True when management plane likely reachable with current credentials. */
  healthy: boolean;
}

export interface CloudflaredStatus {
  installed: boolean;
  path: string | null;
  version: string | null;
  detail: string;
}

export type FetchLike = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

/** Collect static hygiene lines (no network). */
export function collectSecurityHygiene(
  env: NodeJS.ProcessEnv = process.env,
  options?: { configPath?: string }
): SecurityCheckLine[] {
  const profile = resolveOperatorTransportProfile(env as OperatorTransportEnv);
  const hasBearer = Boolean(profile.bearerToken);
  const hasAccess = Boolean(
    profile.accessClientId && profile.accessClientSecret
  );
  const hasCfToken = Boolean(env.CLOUDFLARE_API_TOKEN?.trim());
  const lines: SecurityCheckLine[] = [];

  lines.push({
    id: "operator-bearer",
    severity: hasBearer ? "ok" : "warn",
    label: "HOOX_API_TOKEN / Bearer",
    detail: hasBearer
      ? "set (must match Worker OPERATOR_API_KEY)"
      : "unset — required for /v1/* unless using Access-only edge (still need Bearer for Worker)",
  });

  lines.push({
    id: "access-service-token",
    severity: hasAccess ? "ok" : "info",
    label: "CF Access service token env",
    detail: hasAccess
      ? "CF_ACCESS_CLIENT_ID + SECRET set"
      : "unset — set for Access-protected mgmt hostnames",
  });

  lines.push({
    id: "transport",
    severity: "info",
    label: "HOOX_TRANSPORT",
    detail: `${profile.transport} (apiBase=${profile.apiBase})`,
  });

  lines.push({
    id: "cf-api-token",
    severity: hasCfToken ? "ok" : "info",
    label: "CLOUDFLARE_API_TOKEN",
    detail: hasCfToken
      ? "set (prefer scoped tokens; not Global API Key)"
      : "unset (wrangler login OK for interactive ops)",
  });

  const configPath = options?.configPath;
  if (configPath) {
    const open = isConfigWorldOrGroupReadable(configPath);
    const warn = formatConfigPermissionWarning(configPath);
    lines.push({
      id: "config-perms",
      severity: open ? "warn" : "ok",
      label: "~/.hoox/config.json permissions",
      detail: open
        ? (warn ?? "group/world accessible")
        : "owner-only or missing (ok)",
    });
  } else {
    lines.push({
      id: "config-perms",
      severity: "info",
      label: "config file permissions",
      detail: "keep ~/.hoox/config.json mode 600 (may hold apiToken)",
    });
  }

  if (hasAccess && profile.transport === "public") {
    lines.push({
      id: "transport-hint",
      severity: "info",
      label: "Transport hint",
      detail:
        "Access credentials present — consider HOOX_TRANSPORT=access or leave auto-detect",
    });
  }

  lines.push({
    id: "hostname-split",
    severity: "info",
    label: "Hostname split",
    detail:
      "Prefer mgmt.* for /v1/* + Access; keep gateway.* for TradingView /webhook",
  });

  return lines;
}

/**
 * Classify an HTTP status from an operator management probe.
 * Pure — no I/O.
 */
export function classifyOperatorProbeStatus(
  status: number,
  bodySnippet = ""
): { classification: ProbeClassification; detail: string; healthy: boolean } {
  if (status >= 200 && status < 300) {
    return {
      classification: "ok",
      detail: `HTTP ${status} — management endpoint accepted request`,
      healthy: true,
    };
  }
  if (status === 401 || status === 403) {
    return {
      classification: "auth_required",
      detail: `HTTP ${status} — auth rejected (check HOOX_API_TOKEN ↔ OPERATOR_API_KEY)`,
      healthy: false,
    };
  }
  if (status === 302 || status === 301 || status === 307 || status === 308) {
    return {
      classification: "access_gate",
      detail: `HTTP ${status} — likely Cloudflare Access login redirect (use service token)`,
      healthy: false,
    };
  }
  // Some Access deployments return 302 HTML; 400 with access hints
  const lower = bodySnippet.toLowerCase();
  if (
    lower.includes("cloudflareaccess") ||
    lower.includes("cf-access") ||
    lower.includes("access denied")
  ) {
    return {
      classification: "access_gate",
      detail: `HTTP ${status} — Access gate signals in body`,
      healthy: false,
    };
  }
  if (status === 404) {
    return {
      classification: "not_found",
      detail: `HTTP ${status} — path missing (deploy operator /v1 routes or wrong host)`,
      healthy: false,
    };
  }
  return {
    classification: "unexpected",
    detail: `HTTP ${status}`,
    healthy: false,
  };
}

/**
 * Probe GET {apiBase}/v1/health (or custom path) with operator headers.
 * Does not follow redirects so Access gates surface as 30x.
 */
export async function probeOperatorManagement(
  options: {
    profile?: OperatorTransportProfile;
    env?: OperatorTransportEnv;
    path?: string;
    fetchImpl?: FetchLike;
    /** When true, send no auth headers (baseline Access/public exposure check). */
    anonymous?: boolean;
  } = {}
): Promise<OperatorProbeResult> {
  const profile =
    options.profile ??
    resolveOperatorTransportProfile(
      options.env ?? (process.env as OperatorTransportEnv)
    );
  const path = options.path ?? "/v1/health";
  const url = operatorUrl(profile, path);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (!options.anonymous) {
    Object.assign(headers, buildOperatorAuthHeaders(profile));
  }

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers,
      redirect: "manual",
    });
    let snippet = "";
    try {
      snippet = (await response.text()).slice(0, 200);
    } catch {
      // ignore body read errors
    }
    const classified = classifyOperatorProbeStatus(response.status, snippet);
    return {
      url,
      status: response.status,
      ...classified,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      url,
      status: null,
      classification: "network",
      detail: `network error: ${msg}`,
      healthy: false,
    };
  }
}

/**
 * Detect cloudflared binary (PATH + common locations). Injectable for tests.
 */
export async function detectCloudflared(
  options: {
    whichImpl?: (cmd: string) => Promise<string | null>;
    versionImpl?: (bin: string) => Promise<string | null>;
  } = {}
): Promise<CloudflaredStatus> {
  const whichImpl =
    options.whichImpl ??
    (async (cmd: string) => {
      try {
        const proc = Bun.spawn(["which", cmd], {
          stdout: "pipe",
          stderr: "pipe",
        });
        const out = await new Response(proc.stdout).text();
        const code = await proc.exited;
        if (code !== 0) return null;
        const path = out.trim();
        return path.length > 0 ? path : null;
      } catch {
        return null;
      }
    });

  const versionImpl =
    options.versionImpl ??
    (async (bin: string) => {
      try {
        const proc = Bun.spawn([bin, "--version"], {
          stdout: "pipe",
          stderr: "pipe",
        });
        const out = await new Response(proc.stdout).text();
        const err = await new Response(proc.stderr).text();
        await proc.exited;
        const text = (out || err).trim();
        return text.length > 0 ? text.split("\n")[0]! : null;
      } catch {
        return null;
      }
    });

  const path = await whichImpl("cloudflared");
  if (!path) {
    return {
      installed: false,
      path: null,
      version: null,
      detail:
        "cloudflared not found on PATH — install from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
    };
  }
  const version = await versionImpl(path);
  return {
    installed: true,
    path,
    version,
    detail: version ? `found ${path} (${version})` : `found ${path}`,
  };
}

/** Build doctor --security summary lines from probe pair (anon + authed). */
export function formatProbeSecurityLines(
  authed: OperatorProbeResult,
  anonymous?: OperatorProbeResult,
  profile?: OperatorTransportProfile
): SecurityCheckLine[] {
  const lines: SecurityCheckLine[] = [];
  const creds = profile ? hasOperatorClientCredentials(profile) : false;

  if (anonymous) {
    const severity: SecurityCheckSeverity =
      anonymous.classification === "ok"
        ? "warn"
        : anonymous.classification === "access_gate" ||
            anonymous.classification === "auth_required"
          ? "ok"
          : anonymous.classification === "network"
            ? "warn"
            : "info";
    lines.push({
      id: "probe-anonymous",
      severity,
      label: "Anonymous /v1/health",
      detail: `${anonymous.detail} (${anonymous.url})`,
      hardFail: false,
    });
    if (anonymous.classification === "ok") {
      lines.push({
        id: "probe-anonymous-open",
        severity: "warn",
        label: "Public management surface",
        detail:
          "Anonymous caller got 2xx — put Access on mgmt hostname or enforce OPERATOR_API_KEY",
        hardFail: false,
      });
    }
  }

  // Auth failures only hard-fail when the user actually supplied credentials.
  const authSeverity: SecurityCheckSeverity = authed.healthy
    ? "ok"
    : authed.classification === "network" ||
        authed.classification === "not_found" ||
        !creds
      ? "warn"
      : "error";

  lines.push({
    id: "probe-authed",
    severity: authSeverity,
    label: "Authenticated /v1/health",
    detail: `${authed.detail} (${authed.url})`,
    hardFail: authSeverity === "error",
  });

  return lines;
}

/**
 * Whether doctor --security should exit non-zero given check lines.
 * Only hardFail lines fail the command (warnings never fail).
 */
export function securityChecksFailed(lines: SecurityCheckLine[]): boolean {
  return lines.some((l) => l.hardFail === true);
}
