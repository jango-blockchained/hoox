/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @hoox/shared — TUI display types (re-exports)
 *
 * Canonical type definitions live in ./src/types.ts.
 * This file is a convenience re-export for legacy import paths
 * (e.g. "packages/shared/types" or "@hoox-sh/hoox-shared/types").
 */

export type {
  ViewId,
  ModalState,
  WorkerStatus,
  WorkerInfo,
  TradeSide,
  Trade,
  AlertSeverity,
  Alert,
  LogLevel,
  LogEntry,
  SystemMetrics,
  ConnectionStatus,
  LogFilter,
  NotificationPreferences,
} from "./src/types";
