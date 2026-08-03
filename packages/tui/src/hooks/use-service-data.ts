/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * useServiceData — Thin typed wrapper over Zustand useServiceStore.
 *
 * Usage: useServiceData(s => s.workers)
 *        useServiceData(s => s.connectionStatus)
 */
import { useServiceStore } from "@hoox-sh/hoox-shared";

export function useServiceData<T>(
  selector: (state: ReturnType<typeof useServiceStore.getState>) => T
): T {
  return useServiceStore(selector);
}
