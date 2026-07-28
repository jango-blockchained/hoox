/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared Bun.spawn shim for test environments.
 *
 * Intercepts Bun.spawn calls and returns a no-op fake process for commands
 * that would spawn heavy external processes (wrangler, hoox CLI, etc.),
 * preventing ghost processes from accumulating during test runs.
 *
 * Set HOOX_TEST_ALLOW_WRANGLER=1 to allow these commands in live tests.
 */
export function installSpawnShim(): void {
  const BLOCKED_PATTERNS = ["wrangler", "hoox"];

  try {
    if (
      typeof Bun !== "undefined" &&
      typeof (Bun as Record<string, unknown>).spawn === "function"
    ) {
      const realSpawn = (Bun as Record<string, unknown>).spawn as (
        ...args: unknown[]
      ) => unknown;

      (Bun as Record<string, unknown>).spawn = (...args: unknown[]) => {
        const cmd = args[0];
        const cmdStr = Array.isArray(cmd) ? cmd.join(" ") : String(cmd);

        const isBlocked =
          process.env.HOOX_TEST_ALLOW_WRANGLER !== "1" &&
          BLOCKED_PATTERNS.some((p) => cmdStr.includes(p));

        if (isBlocked) {
          return makeFakeProcess();
        }

        return realSpawn(...args);
      };
    }
  } catch (err) {
    console.warn("Failed to install Bun.spawn shim:", err);
  }
}

function makeFakeProcess() {
  const encoder = new TextEncoder();
  const emptyChunk = encoder.encode("");
  const emptyStream = new ReadableStream({
    start(controller) {
      controller.enqueue(emptyChunk);
      controller.close();
    },
  });

  return {
    stdout: emptyStream,
    stderr: emptyStream,
    stdin: { write: () => {}, end: () => {} },
    exited: Promise.resolve(0),
    pid: -1,
    kill: () => {},
  };
}
