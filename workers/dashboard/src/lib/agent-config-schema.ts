/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from "zod";

export const agentConfigSchema = z.object({
  defaultProvider: z.string().optional(),
  fallbackChain: z.array(z.string()).optional(),
  modelMap: z.record(z.string(), z.string()).optional(),
  timeoutMs: z.number().optional(),
  retryCount: z.number().optional(),
  maxDailyDrawdownPercent: z.number().optional(),
  trailingStopPercent: z.number().optional(),
  takeProfitPercent: z.number().optional(),
});
