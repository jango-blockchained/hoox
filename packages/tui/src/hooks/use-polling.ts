/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * usePolling — Configurable polling with exponential backoff.
 *
 * Reads refreshIntervalMs from config store. Doubles interval on failure
 * (up to 16s max). Resets on success. Pause/resume via enabled toggle.
 */
import { useEffect, useRef } from "react";
import { useConfigStore } from "@hoox-sh/hoox-shared";

export interface UsePollingOptions {
  callback: () => Promise<void>;
  enabled?: boolean;
  immediate?: boolean;
}

export function usePolling(options: UsePollingOptions): void {
  const { callback, enabled = true, immediate = true } = options;
  const intervalMs = useConfigStore((s) => s.refreshIntervalMs);
  const callbackRef = useRef(callback);
  const retryCount = useRef(0);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    let timeoutId: Timer;
    let cancelled = false;
    const MAX_BACKOFF = 16_000;

    const poll = async () => {
      if (cancelled) return;
      try {
        await callbackRef.current();
        retryCount.current = 0;
      } catch {
        retryCount.current++;
      }
      if (cancelled) return;
      // Read fresh from store on every iteration so config changes take effect
      const currentInterval = useConfigStore.getState().refreshIntervalMs;
      const backoff = Math.min(
        currentInterval * Math.pow(2, retryCount.current),
        MAX_BACKOFF
      );
      timeoutId = setTimeout(poll, backoff);
    };

    if (immediate) {
      poll();
    } else {
      const initialInterval = useConfigStore.getState().refreshIntervalMs;
      timeoutId = setTimeout(poll, initialInterval);
    }

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [intervalMs, enabled, immediate]);
}
