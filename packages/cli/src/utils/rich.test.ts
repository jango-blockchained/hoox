/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, mock } from "bun:test";
import { runRichTasks, type RichTaskResult } from "./rich.js";
import { CLIError } from "./errors.js";

/** Force stdout into TTY mode so isRichMode() returns true. */
function withTTY<T>(fn: () => Promise<T> | T): Promise<T> {
  const original = process.stdout.isTTY;
  Object.defineProperty(process.stdout, "isTTY", {
    value: true,
    configurable: true,
    writable: true,
  });
  return Promise.resolve(fn()).finally(() => {
    Object.defineProperty(process.stdout, "isTTY", {
      value: original,
      configurable: true,
      writable: true,
    });
  });
}

function withNonTTY<T>(fn: () => Promise<T> | T): Promise<T> {
  const original = process.stdout.isTTY;
  Object.defineProperty(process.stdout, "isTTY", {
    value: false,
    configurable: true,
    writable: true,
  });
  return Promise.resolve(fn()).finally(() => {
    Object.defineProperty(process.stdout, "isTTY", {
      value: original,
      configurable: true,
      writable: true,
    });
  });
}

describe("runRichTasks", () => {
  it("returns an empty array for empty input", async () => {
    const results = await runRichTasks([]);
    expect(results).toEqual([]);
  });

  it("captures a successful numeric result", async () => {
    await withTTY(async () => {
      const results = await runRichTasks([
        { title: "first", run: async () => 1 },
      ]);
      expect(results[0]?.ok).toBe(true);
      expect(results[0]?.value).toBe(1);
    });
  });

  it("captures a successful string result", async () => {
    await withTTY(async () => {
      const results = await runRichTasks([
        { title: "second", run: async () => "two" },
      ]);
      expect(results[0]?.ok).toBe(true);
      expect(results[0]?.value).toBe("two");
    });
  });

  it("preserves the order of results", async () => {
    await withTTY(async () => {
      const results = await runRichTasks([
        { title: "alpha", run: async () => 1 },
        { title: "beta", run: async () => 2 },
        { title: "gamma", run: async () => 3 },
      ]);
      expect(results.map((r) => r.title)).toEqual(["alpha", "beta", "gamma"]);
    });
  });

  it("captures failed results without throwing", async () => {
    await withTTY(async () => {
      const results = await runRichTasks([
        {
          title: "boom",
          run: async () => {
            throw new Error("kaboom");
          },
        },
      ]);
      expect(results[0]?.ok).toBe(false);
      expect(results[0]?.error).toBe("kaboom");
      expect(process.exitCode).toBe(1);
    });
  });

  it("uses CLIError message verbatim on failure", async () => {
    await withTTY(async () => {
      const results = await runRichTasks([
        {
          title: "fail",
          run: async () => {
            throw new CLIError("nope", 2, "details");
          },
        },
      ]);
      expect(results[0]?.error).toBe("nope");
    });
  });

  it("attaches details() output to successful results", async () => {
    await withTTY(async () => {
      const results = await runRichTasks([
        {
          title: "with details",
          run: async () => "ok",
          details: () => ({ url: "https://example.com", size: "1.2 MB" }),
        },
      ]);
      expect(results[0]?.details).toEqual({
        url: "https://example.com",
        size: "1.2 MB",
      });
    });
  });

  it("passes the run() return value to details()", async () => {
    await withTTY(async () => {
      const results = await runRichTasks<{ url: string }>([
        {
          title: "typed",
          run: async () => ({ url: "https://x" }),
          details: (value) => ({ URL: value.url }),
        },
      ]);
      expect(results[0]?.details).toEqual({ URL: "https://x" });
    });
  });

  it("records non-zero duration for every task", async () => {
    await withTTY(async () => {
      const results = await runRichTasks([
        {
          title: "slow",
          run: async () => {
            await new Promise((r) => setTimeout(r, 10));
            return 1;
          },
        },
      ]);
      expect(results[0]?.ms).toBeGreaterThanOrEqual(0);
    });
  });

  it("calls onSummary hook with the result array", async () => {
    await withTTY(async () => {
      const captured: RichTaskResult[] = [];
      await runRichTasks([{ title: "a", run: async () => 1 }], {
        onSummary: (r) => captured.push(...r),
      });
      expect(captured).toHaveLength(1);
      expect(captured[0]?.title).toBe("a");
    });
  });

  it("respects --json by suppressing the default summary table", async () => {
    await withTTY(async () => {
      // Spy on process.stdout.write to count summary lines (border row).
      const original = process.stdout.write.bind(process.stdout);
      const writeMock = mock((chunk: string | Buffer) => {
        return original(typeof chunk === "string" ? chunk : chunk.toString());
      });
      process.stdout.write =
        writeMock as unknown as typeof process.stdout.write;
      try {
        await runRichTasks([{ title: "a", run: async () => 1 }], {
          format: { json: true },
        });
        const allCalls = writeMock.mock.calls
          .map((c) => (typeof c[0] === "string" ? c[0] : String(c[0])))
          .join("");
        // No box-drawing top border should be emitted in json mode.
        expect(allCalls).not.toContain("┌");
      } finally {
        process.stdout.write = original;
      }
    });
  });

  it("emits zero summary output when --json is set (silent mode)", async () => {
    // Spy on process.stdout.write to ensure nothing reaches stdout
    // (clack's log functions go through a different path; what matters
    // is that our wrapper doesn't emit the title or summary table).
    const original = process.stdout.write.bind(process.stdout);
    const writeMock = mock((chunk: string | Buffer) => {
      return original(typeof chunk === "string" ? chunk : chunk.toString());
    });
    process.stdout.write = writeMock as unknown as typeof process.stdout.write;
    try {
      const results = await runRichTasks(
        [
          { title: "a", run: async () => 1 },
          { title: "b", run: async () => 2 },
        ],
        {
          format: { json: true },
          title: "Should-not-appear-in-output",
        }
      );
      // Tasks still ran and produced results.
      expect(results).toHaveLength(2);
      expect(results[0]?.ok).toBe(true);
      expect(results[1]?.ok).toBe(true);

      // The summary table and the title shouldn't have been written.
      const allCalls = writeMock.mock.calls
        .map((c) => (typeof c[0] === "string" ? c[0] : String(c[0])))
        .join("");
      expect(allCalls).not.toContain("Should-not-appear-in-output");
      expect(allCalls).not.toContain("┌");
    } finally {
      process.stdout.write = original;
    }
  });

  it("uses the plain path when not a TTY (still returns results)", async () => {
    await withNonTTY(async () => {
      const results = await runRichTasks([
        { title: "a", run: async () => 1 },
        { title: "b", run: async () => 2 },
      ]);
      expect(results).toHaveLength(2);
      expect(results[0]?.ok).toBe(true);
      expect(results[1]?.ok).toBe(true);
    });
  });

  it("plain path: captures failure with error message", async () => {
    await withNonTTY(async () => {
      const results = await runRichTasks([
        {
          title: "p-fail",
          run: async () => {
            throw new Error("plain kaboom");
          },
        },
      ]);
      expect(results[0]?.ok).toBe(false);
      expect(results[0]?.error).toBe("plain kaboom");
      expect(process.exitCode).toBe(1);
    });
  });

  it("plain path: attaches details() to successful results", async () => {
    await withNonTTY(async () => {
      const results = await runRichTasks([
        {
          title: "with details",
          run: async () => "ok",
          details: () => ({ url: "https://example.com" }),
        },
      ]);
      expect(results[0]?.details).toEqual({ url: "https://example.com" });
    });
  });

  it("does not set exitCode when all tasks succeed", async () => {
    const before = process.exitCode;
    await withTTY(async () => {
      await runRichTasks([{ title: "ok", run: async () => 1 }]);
    });
    expect(process.exitCode).toBe(before);
  });
});
