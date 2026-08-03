/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ProvisioningPlan, ProvisionResult } from "./types";

/**
 * Interface for Cloudflare infrastructure provisioning.
 * CLI implements via wrangler CLI (Bun.spawn).
 * TUI implements via CliBridge (calls hoox infra provision).
 */
export interface Provisioner {
  provision(plan: ProvisioningPlan): Promise<ProvisionResult>;
  check(plan: ProvisioningPlan): Promise<ProvisionResult>;
}
