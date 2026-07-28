/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Connection toast notifications — mode-aware messages for LOCAL/REMOTE
 * state changes (connected, lost, reconnected, auth, rate limit).
 *
 * Uses the Hoox-styled toast helpers from ./toast.tsx.
 * Message builders are pure and exported for unit tests.
 */
import { toastSuccess, toastWarning, toastInfo, toastError } from "./toast";
import { formatDuration } from "@jango-blockchained/hoox-shared";
import type { TuiMode } from "../../services/tui-connection";
import { remoteAuthMissingHint } from "../../services/tui-connection";

// ─── Pure message builders (testable without toast side effects) ─────────────

export function messageConnected(mode: TuiMode, host: string): string {
  const label = mode === "remote" ? "REMOTE" : "LOCAL";
  return `Connected · ${label} · ${host}`;
}

export function messageConnectionLost(mode: TuiMode, host: string): string {
  const label = mode === "remote" ? "REMOTE" : "LOCAL";
  return `Connection lost · ${label} · ${host}`;
}

export function messageReconnected(
  mode: TuiMode,
  host: string,
  disconnectedAt: number,
  now: number = Date.now()
): string {
  const label = mode === "remote" ? "REMOTE" : "LOCAL";
  const duration = formatDuration(Math.max(0, now - disconnectedAt));
  return `Reconnected · ${label} · ${host} · ${duration} downtime`;
}

export function messageAuthRequired(mode: TuiMode, host: string): string {
  const label = mode === "remote" ? "REMOTE" : "LOCAL";
  return `Auth failed · ${label} · ${host}`;
}

export function messageAuthMissing(host: string): string {
  return `No API token · REMOTE · ${host}`;
}

export function messageOfflineStartup(
  mode: TuiMode,
  host: string,
  kind: "auth" | "network" | "rate-limit" | "unknown"
): string {
  const label = mode === "remote" ? "REMOTE" : "LOCAL";
  if (kind === "auth") {
    return `Could not connect · ${label} · ${host} (auth)`;
  }
  if (kind === "rate-limit") {
    return `Could not connect · ${label} · ${host} (rate limited)`;
  }
  return `Could not connect · ${label} · ${host}`;
}

// ─── Toast factory functions ─────────────────────────────────────────────────

/**
 * Show a "Reconnected" toast with downtime duration.
 * Called when the connection state transitions back to 'connected' after a
 * disconnection period.
 *
 * @param disconnectedAt  Timestamp (ms) when the disconnection began
 * @deprecated Prefer {@link toastReconnectedMode} for mode-aware copy
 */
export function toastReconnected(disconnectedAt: number): void {
  const now = Date.now();
  const downtime = now - disconnectedAt;
  const duration = formatDuration(downtime);
  toastSuccess(`Reconnected \u2022 ${duration} downtime`);
}

/** Mode-aware reconnect toast. */
export function toastReconnectedMode(
  mode: TuiMode,
  host: string,
  disconnectedAt: number
): void {
  toastSuccess(messageReconnected(mode, host, disconnectedAt), {
    duration: 4000,
  });
}

/**
 * Show a rate limit warning toast.
 * Called when the API returns HTTP 429.
 */
export function toastRateLimited(): void {
  toastWarning("API rate limited \u2014 backing off", {
    duration: 6000,
  });
}

/**
 * Show a config saved confirmation toast.
 * Called after config-store persists to disk.
 */
export function toastConfigSaved(): void {
  toastSuccess("Configuration saved", {
    duration: 3000,
  });
}

/**
 * Show a deploy started toast (loading/persistent).
 * Returns the toast ID so it can be updated to success/error when deploy completes.
 *
 * @param workerName  Name of the worker being deployed
 * @returns           Toast ID for updating later
 */
export function toastDeployStarted(workerName: string): string | number {
  return toastInfo(`Deploy started: ${workerName}`, {
    duration: 0, // persistent until updated
  });
}

/**
 * Show a deploy completed toast.
 * Updates or creates a success toast for the completed deployment.
 *
 * @param workerName  Name of the deployed worker
 */
export function toastDeployCompleted(workerName: string): void {
  toastSuccess(`Deploy completed: ${workerName}`, {
    duration: 4000,
  });
}

/**
 * Show a deploy failed toast.
 *
 * @param workerName  Name of the worker that failed to deploy
 * @param error       Error message
 */
export function toastDeployFailed(workerName: string, error: string): void {
  toastWarning(`Deploy failed: ${workerName} \u2014 ${error}`, {
    duration: 8000,
  });
}

/**
 * Show a connection lost warning toast.
 * Called when the connection transitions to 'offline'.
 * @deprecated Prefer {@link toastConnectionLostMode}
 */
export function toastConnectionLost(): void {
  toastWarning("Connection lost \u2014 retrying with backoff", {
    duration: 0, // persistent until reconnected
  });
}

/** Mode-aware connection lost toast. */
export function toastConnectionLostMode(mode: TuiMode, host: string): void {
  toastWarning(messageConnectionLost(mode, host), {
    description:
      mode === "remote"
        ? "Check gateway URL, network, and HOOX_API_TOKEN"
        : "Is `hoox dev` / wrangler running on this host?",
    duration: 0,
  });
}

/** First successful connect (startup or after offline). */
export function toastConnectedMode(mode: TuiMode, host: string): void {
  toastSuccess(messageConnected(mode, host), { duration: 3500 });
}

/** HTTP 401/403 while talking to the API. */
export function toastAuthRequiredMode(mode: TuiMode, host: string): void {
  toastError(messageAuthRequired(mode, host), {
    description:
      mode === "remote"
        ? remoteAuthMissingHint()
        : "Check HOOX_API_TOKEN if the local gateway enforces auth",
    duration: 8000,
  });
}

/** Remote launch without a token configured. */
export function toastAuthMissingRemote(host: string): void {
  toastWarning(messageAuthMissing(host), {
    description: remoteAuthMissingHint(),
    duration: 7000,
  });
}

/** Startup could not reach the API. */
export function toastOfflineStartup(
  mode: TuiMode,
  host: string,
  kind: "auth" | "network" | "rate-limit" | "unknown"
): void {
  const description =
    kind === "auth"
      ? remoteAuthMissingHint()
      : mode === "remote"
        ? "Remote gateway unreachable — CLI fallback is disabled in REMOTE mode"
        : "Trying CLI fallback if available";
  toastWarning(messageOfflineStartup(mode, host, kind), {
    description,
    duration: 6000,
  });
}
