/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Types for the `hoox infra` command group.
 */

/** Global CLI options available to infra subcommands. */
export interface InfraOptions {
  json?: boolean;
  quiet?: boolean;
}

/** A single infrastructure resource provisioned (or attempted). */
export interface ProvisionItem {
  name: string;
  type: "d1" | "kv" | "r2" | "queue";
  status: "created" | "exists" | "error";
  error?: string;
}

/** Result of the `provision` subcommand. */
export interface ProvisionResult {
  items: ProvisionItem[];
  summary: { total: number; created: number; errors: number; exists: number };
}
