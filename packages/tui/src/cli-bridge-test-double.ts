/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared CLI bridge test double.
 *
 * Installed once from `test-setup.ts` via `mock.module` so every TUI test
 * file gets a full no-op surface without each suite re-mocking the module
 * (and accidentally stripping methods other suites need).
 *
 * Override per-test with:
 *   cliBridgeDouble.checkSetup.mockResolvedValueOnce({ ... })
 * or reassign mockImplementation, then call `resetCliBridgeDouble()` in
 * afterEach / beforeEach so defaults return for the next case.
 */
import { mock } from "bun:test";
import type { CliResult } from "./types";

/** Standard successful CliResult shell. */
export function okCliResult<T = null>(
  data: T | null = null,
  overrides: Partial<CliResult<T>> = {}
): Promise<CliResult<T>> {
  return Promise.resolve({
    success: true,
    exitCode: 0,
    stdout: "",
    stderr: "",
    data: data as T,
    duration: 0,
    command: "hoox (test double)",
    errorType: null,
    ...overrides,
  });
}

/** Standard failed CliResult shell. */
export function failCliResult(
  stderr = "test failure",
  overrides: Partial<CliResult<null>> = {}
): Promise<CliResult<null>> {
  return Promise.resolve({
    success: false,
    exitCode: 1,
    stdout: "",
    stderr,
    data: null,
    duration: 0,
    command: "hoox (test double)",
    errorType: "non-zero-exit",
    ...overrides,
  });
}

function applyDefaults(): void {
  cliBridgeDouble.resolveBinary.mockImplementation(
    async () => "/usr/local/bin/hoox"
  );
  cliBridgeDouble.invalidateCache.mockImplementation(() => {});
  cliBridgeDouble.onError.mockImplementation(() => () => {});
  cliBridgeDouble.abort.mockImplementation(() => {});
  cliBridgeDouble.dispose.mockImplementation(() => {});

  const ok = () => okCliResult();
  cliBridgeDouble.deployAll.mockImplementation(ok);
  cliBridgeDouble.deployWorker.mockImplementation(ok);
  cliBridgeDouble.checkHealth.mockImplementation(ok);
  cliBridgeDouble.checkHealthFix.mockImplementation(ok);
  cliBridgeDouble.checkFix.mockImplementation(ok);
  cliBridgeDouble.workerLogs.mockImplementation(ok);
  cliBridgeDouble.configShow.mockImplementation(ok);
  cliBridgeDouble.configValidate.mockImplementation(ok);
  cliBridgeDouble.monitorStatus.mockImplementation(ok);
  cliBridgeDouble.rebuild.mockImplementation(ok);
  cliBridgeDouble.repairWorker.mockImplementation(ok);
  cliBridgeDouble.checkSetup.mockImplementation(ok);
  cliBridgeDouble.monitorKillSwitch.mockImplementation(() =>
    okCliResult({ engaged: false })
  );
  cliBridgeDouble.monitorQueueDepth.mockImplementation(() => okCliResult([]));
  cliBridgeDouble.dbQuery.mockImplementation(() =>
    okCliResult({
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: null,
      meta: null,
    })
  );
  cliBridgeDouble.configKvList.mockImplementation(() =>
    okCliResult({
      keys: [],
      timestamp: new Date().toISOString(),
      namespaceId: null,
    })
  );
  cliBridgeDouble.configKvGet.mockImplementation(() => okCliResult(null));
  cliBridgeDouble.configKvSet.mockImplementation(() => okCliResult(null));
  cliBridgeDouble.configSecretsList.mockImplementation(() =>
    okCliResult({ secrets: [], timestamp: new Date().toISOString() })
  );
  cliBridgeDouble.agentHealthCheck.mockImplementation(() =>
    okCliResult({ providers: [], overallStatus: "online" as const })
  );
}

/**
 * Mutable double — methods are bun `mock()` fns so tests can
 * `mockResolvedValue` / `mockImplementation` per case.
 */
export const cliBridgeDouble = {
  resolveBinary: mock(async () => "/usr/local/bin/hoox"),
  invalidateCache: mock(() => {}),
  onError: mock(() => () => {}),
  abort: mock(() => {}),
  dispose: mock(() => {}),
  deployAll: mock(() => okCliResult()),
  deployWorker: mock(() => okCliResult()),
  checkHealth: mock(() => okCliResult()),
  checkHealthFix: mock(() => okCliResult()),
  checkFix: mock(() => okCliResult()),
  workerLogs: mock(() => okCliResult()),
  configShow: mock(() => okCliResult()),
  configValidate: mock(() => okCliResult()),
  monitorStatus: mock(() => okCliResult()),
  rebuild: mock(() => okCliResult()),
  repairWorker: mock(() => okCliResult()),
  checkSetup: mock(() => okCliResult()),
  monitorKillSwitch: mock(() => okCliResult({ engaged: false })),
  monitorQueueDepth: mock(() => okCliResult([])),
  dbQuery: mock(() =>
    okCliResult({
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: null,
      meta: null,
    })
  ),
  configKvList: mock(() =>
    okCliResult({
      keys: [],
      timestamp: new Date().toISOString(),
      namespaceId: null,
    })
  ),
  configKvGet: mock(() => okCliResult(null)),
  configKvSet: mock(() => okCliResult(null)),
  configSecretsList: mock(() =>
    okCliResult({ secrets: [], timestamp: new Date().toISOString() })
  ),
  agentHealthCheck: mock(() =>
    okCliResult({ providers: [], overallStatus: "online" as const })
  ),
};

applyDefaults();

/** Clear call history and restore default implementations. */
export function resetCliBridgeDouble(): void {
  for (const value of Object.values(cliBridgeDouble)) {
    if (value && typeof value === "function" && "mockClear" in value) {
      (value as ReturnType<typeof mock>).mockClear();
    }
  }
  applyDefaults();
}

/** Factory for mock.module — re-exports real standalone helpers. */
export async function createCliBridgeModuleMock(): Promise<
  Record<string, unknown>
> {
  const standalone = await import("./services/cli-bridge/standalone");
  const types = await import("./services/cli-bridge/types");
  return {
    cliBridge: cliBridgeDouble,
    validateReadOnlySql: standalone.validateReadOnlySql,
    agentChatStream: standalone.agentChatStream,
    AI_MODEL_OPTIONS: standalone.AI_MODEL_OPTIONS,
    // Type re-exports are erased at runtime; keep values if any exist
    ...Object.fromEntries(
      Object.entries(types).filter(([, v]) => typeof v !== "undefined")
    ),
  };
}
