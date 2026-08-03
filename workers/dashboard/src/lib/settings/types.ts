/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

export type FieldType =
  | "boolean"
  | "number"
  | "text"
  | "select"
  | "json"
  | "textarea";

/**
 * Marks how a field should be rendered in the form.
 * - "normal" (default): editable
 * - "dangerous": editable but requires explicit confirmation before save
 *   (e.g. kill_switch, max_daily_drawdown_percent)
 * - "secret": read-only in the UI; must be set via CLI (`hoox secrets update-cf`).
 *   Use the `cliCommand` field to show the user the exact command to run.
 */
export type FieldKind = "normal" | "dangerous" | "secret";

export interface SettingOption {
  value: string;
  label: string;
}

export interface SettingField {
  key: string;
  label: string;
  description?: string;
  type: FieldType;
  default: string | number | boolean;
  options?: SettingOption[];
  placeholder?: string;
  /**
   * UI semantics. Default "normal". "secret" fields are read-only and shown
   * with a "Configure via CLI" hint + the command from `cliCommand`.
   */
  kind?: FieldKind;
  /**
   * For `kind: "secret"` fields: the exact command the user should run
   * to set this value (e.g. `hoox secrets update-cf openai_key agent-worker`).
   */
  cliCommand?: string;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    required?: boolean;
  };
}

export interface DashboardSection {
  id: string;
  title: string;
  description: string;
  icon?: string;
  priority: number;
  fields: SettingField[];
}

export interface DashboardComponent {
  id: string;
  title: string;
  type: "table" | "chart" | "card" | "metric";
  priority: number;
  props: Record<string, unknown>;
}

export interface WorkerDashboardConfig {
  worker: string;
  displayName: string;
  description?: string;
  sections: DashboardSection[];
  components?: DashboardComponent[];
}

export interface MergedSettings {
  [worker: string]: {
    [key: string]: string | number | boolean;
  };
}

export interface SettingsUpdateRequest {
  worker: string;
  key: string;
  value: string | number | boolean;
}
