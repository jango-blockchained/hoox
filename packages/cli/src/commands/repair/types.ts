/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

export interface RepairStepResult {
  step: string;
  success: boolean;
  message?: string;
  error?: string;
}

export interface RepairCheckResult {
  steps: RepairStepResult[];
  allPassed: boolean;
  passedCount: number;
  failedCount: number;
}
