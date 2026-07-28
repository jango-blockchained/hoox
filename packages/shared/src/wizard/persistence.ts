/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import type { WizardState } from "./types";

/**
 * Serialize wizard state to JSON string.
 */
export function serializeState(state: WizardState): string {
  return JSON.stringify(state, null, 2);
}

/**
 * Deserialize wizard state from JSON string.
 */
export function deserializeState(json: string): WizardState {
  const parsed = JSON.parse(json);
  return parsed as WizardState;
}

/**
 * Path for wizard state file (relative to project root).
 */
export const WIZARD_STATE_PATH = ".wizard-state.json";
