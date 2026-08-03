/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Types for the PrerequisitesService.
 *
 * Provides version checking for wrangler and Docker availability checks.
 */

/** Version information for a CLI tool. */
export interface VersionInfo {
  /** Installed version (semver string) or null if not installed. */
  installed: string | null;
  /** Latest available version (semver string) or null if fetch failed. */
  latest: string | null;
  /** Whether the installed version is outdated. */
  outdated: boolean;
}

/** Docker and Docker Compose availability status. */
export interface DockerStatus {
  /** Whether Docker is available and running. */
  dockerAvailable: boolean;
  /** Docker version string or null if unavailable. */
  dockerVersion: string | null;
  /** Whether Docker Compose is available. */
  composeAvailable: boolean;
  /** Docker Compose version string or null if unavailable. */
  composeVersion: string | null;
}

/** Complete prerequisites check result. */
export interface PrerequisitesResult {
  /** Wrangler version information. */
  wrangler: VersionInfo;
  /** Docker and Compose availability. */
  docker: DockerStatus;
}

/** Result of a wrangler version check operation. */
export type WranglerVersionResult =
  | { ok: true; data: VersionInfo }
  | { ok: false; error: string };

/** Result of a Docker check operation. */
export type DockerCheckResult =
  | { ok: true; data: DockerStatus }
  | { ok: false; error: string };

/** Result of a wrangler update operation. */
export type UpdateWranglerResult = { ok: true } | { ok: false; error: string };
