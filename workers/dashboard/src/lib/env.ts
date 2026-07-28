/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import type { KVNamespace } from "@cloudflare/workers-types";

export interface DashboardEnv {
  CONFIG_KV: KVNamespace;
  D1_SERVICE: Fetcher;
  AGENT_SERVICE: Fetcher;
  WEB3_WALLET_SERVICE: Fetcher;
  PYNE_SERVICE: Fetcher;
  AGENT_INTERNAL_KEY?: string;
  PYNE_API_KEY?: string;
}
