/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared network-layer test doubles for TUI unit tests.
 *
 * Installed once from `test-setup.ts` so `service-store` (and any view that
 * triggers fetchWorkers / SSE) never hits a real API. Controllable via
 * exported state + mocks — no per-file mock.module for api-client / sse.
 */
import { mock } from "bun:test";

/** Fixture workers returned by the default hooxFetch mock. */
export let mockApiData: unknown[] = [];
/** When true, hooxFetch throws. */
export let mockApiShouldFail = false;
export let mockApiErrorMessage = "Network error";

/** SSE callbacks registered by subscribeSSE mock. */
export let sseCallbacks: Array<(data: unknown) => void> = [];

export const hooxFetchMock = mock(async (_path: string) => {
  if (mockApiShouldFail) {
    throw new Error(mockApiErrorMessage);
  }
  return mockApiData;
});

export const subscribeSSEMock = mock(
  async <T>(_path: string, callback: (data: T) => void) => {
    sseCallbacks.push(callback as (data: unknown) => void);
    return { abort: () => {} };
  }
);

export function resetNetworkDoubles(): void {
  mockApiData = [];
  mockApiShouldFail = false;
  mockApiErrorMessage = "Network error";
  sseCallbacks = [];
  hooxFetchMock.mockClear();
  subscribeSSEMock.mockClear();
  hooxFetchMock.mockImplementation(async (_path: string) => {
    if (mockApiShouldFail) {
      throw new Error(mockApiErrorMessage);
    }
    return mockApiData;
  });
  subscribeSSEMock.mockImplementation(
    async <T>(_path: string, callback: (data: T) => void) => {
      sseCallbacks.push(callback as (data: unknown) => void);
      return { abort: () => {} };
    }
  );
}

export function setMockApiData(data: unknown[]): void {
  mockApiData = data;
}

export function setMockApiFailure(
  fail: boolean,
  message = "Network error"
): void {
  mockApiShouldFail = fail;
  mockApiErrorMessage = message;
}

/** Push an SSE event to all registered callbacks (tests). */
export function emitSseEvent(data: unknown): void {
  for (const cb of sseCallbacks) {
    cb(data);
  }
}
