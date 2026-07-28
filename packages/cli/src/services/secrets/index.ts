/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

export {
  SecretsService,
  SYSTEM_SECRET_NAMES,
  isSystemSecret,
  default as SecretsServiceDefault,
} from "./secrets-service.js";
export type {
  Result,
  SecretStatus,
  SecretCheckResult,
  SecretSyncItem,
  SecretSyncResult,
  SecretSyncStatus,
  SyncSecretsOptions,
  WorkerSecretConfig,
  WorkersJsonc,
} from "./types.js";
