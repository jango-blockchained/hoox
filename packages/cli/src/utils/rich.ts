/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `runRichTasks` — execute a list of named async tasks with rich terminal
 * feedback (animated checklist, per-task timing, final summary table).
 *
 * Two execution paths:
 *   - Rich mode  (TTY, no --json/--quiet): uses @clack/prompts `tasks()` for
 *     the animated checklist, then a `formatTable` summary.
 *   - Plain mode (CI, piped, --json, --quiet): one `log.step` per task with
 *     timing appended on completion; same final summary table (unless
 *     --json/--quiet, which suppress table output too).
 *
 * Either way, callers receive a uniform result array and may render their
 * own summary via the `onSummary` hook (or use the built-in default).
 */

import * as p from "@clack/prompts";
import { theme, icons } from "./theme.js";
import { formatDuration, startTimer } from "./timer.js";
import { formatTable, type FormatOptions } from "./formatters.js";
import { isRichMode } from "./format-mode.js";
import { CLIError } from "./errors.js";

export interface RichTask<T = unknown> {
  title: string;
  /**
   * Optional key-value lines printed after the task succeeds.
   * Receives the value returned by `run()` so callers can format it.
   */
  details?: (
    value: T
  ) => Record<string, string> | Promise<Record<string, string>>;
  run: () => Promise<T>;
}

export interface RichTaskResult<T = unknown> {
  title: string;
  ok: boolean;
  ms: number;
  value?: T;
  error?: string;
  /** Details captured from `task.details()`, if any. */
  details?: Record<string, string>;
}

export interface RunRichTasksOptions<T = unknown> {
  /** Title for the section. Printed as a header in rich mode. */
  title?: string;
  /** Format options from Commander (--json, --quiet). */
  format?: FormatOptions;
  /** Hook for callers wanting a custom summary. */
  onSummary?: (results: RichTaskResult<T>[]) => void;
}

/**
 * Execute tasks sequentially with a checklist UI.
 *
 * Never throws — individual task failures are captured in the result.
 * `process.exitCode` is set to 1 if any task failed.
 */
export async function runRichTasks<T = unknown>(
  tasks: RichTask<T>[],
  options: RunRichTasksOptions<T> = {}
): Promise<RichTaskResult<T>[]> {
  const rich = isRichMode(options.format);
  const results: RichTaskResult<T>[] = [];

  if (tasks.length === 0) return results;

  // Suppress all per-task output when --json is set. We still execute the
  // tasks (so callers get a complete result array) and still honour
  // `process.exitCode`, but no decoration reaches stdout.
  const silent = options.format?.json === true;

  if (rich && !silent) {
    if (options.title) p.log.step(theme.heading(options.title));

    // Use clack's `tasks()` for the animated checklist.
    await p.tasks(
      tasks.map((t) => ({
        title: t.title,
        task: async (message) => {
          const timer = startTimer();
          try {
            const value = await t.run();
            const result: RichTaskResult<T> = {
              title: t.title,
              ok: true,
              ms: timer.ms(),
              value,
            };
            if (t.details) {
              result.details = await t.details(value);
            }
            results.push(result);
            const dur = formatDuration(result.ms);
            if (result.details) {
              const summary = Object.entries(result.details)
                .map(([k, v]) => `${theme.dim(k)}=${theme.value(v)}`)
                .join(" ");
              message(`${theme.success(icons.success)} ${dur}  ${summary}`);
            } else {
              message(`${theme.success(icons.success)} ${dur}`);
            }
          } catch (err) {
            const message2 =
              err instanceof CLIError
                ? err.message
                : err instanceof Error
                  ? err.message
                  : String(err);
            const result: RichTaskResult<T> = {
              title: t.title,
              ok: false,
              ms: timer.ms(),
              error: message2,
            };
            results.push(result);
            message(
              `${theme.error(icons.error)} ${formatDuration(result.ms)}  ${theme.dim(message2)}`
            );
          }
        },
      }))
    );
  } else if (silent) {
    // JSON mode: execute tasks silently with no decoration.
    for (const t of tasks) {
      const timer = startTimer();
      try {
        const value = await t.run();
        const result: RichTaskResult<T> = {
          title: t.title,
          ok: true,
          ms: timer.ms(),
          value,
        };
        if (t.details) {
          result.details = await t.details(value);
        }
        results.push(result);
      } catch (err) {
        const message2 =
          err instanceof CLIError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
        const result: RichTaskResult<T> = {
          title: t.title,
          ok: false,
          ms: timer.ms(),
          error: message2,
        };
        results.push(result);
      }
    }
  } else {
    // Plain mode (interactive, non-TTY): one `log.step` per task with timing
    // on completion. No spinners, no animation, but visible progress lines.
    for (const t of tasks) {
      p.log.step(t.title);
      const timer = startTimer();
      try {
        const value = await t.run();
        const result: RichTaskResult<T> = {
          title: t.title,
          ok: true,
          ms: timer.ms(),
          value,
        };
        if (t.details) {
          result.details = await t.details(value);
        }
        results.push(result);
        p.log.success(`${t.title} ${theme.dim(formatDuration(result.ms))}`);
      } catch (err) {
        const message2 =
          err instanceof CLIError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
        const result: RichTaskResult<T> = {
          title: t.title,
          ok: false,
          ms: timer.ms(),
          error: message2,
        };
        results.push(result);
        p.log.error(`${t.title} ${theme.dim(message2)}`);
      }
    }
  }

  // Set exit code on any failure.
  if (results.some((r) => !r.ok)) {
    process.exitCode = 1;
  }

  // Summary hook or default table.
  if (options.onSummary) {
    options.onSummary(results);
  } else if (!options.format?.json && !options.format?.quiet) {
    renderDefaultSummary(results);
  }

  return results;
}
/** Render the default summary table: Title, Status, Duration. */
function renderDefaultSummary<T>(results: RichTaskResult<T>[]): void {
  if (results.length === 0) return;
  const rows = results.map((r) => ({
    Task: theme.text(r.title),
    Status: r.ok ? theme.success(icons.success) : theme.error(icons.error),
    Duration: formatDuration(r.ms),
  }));
  // Use the refined formatTable — zebra striping is on by default,
  // status values won't match the auto-color list ("✓"/"✗" aren't
  // keywords"), and there are no numeric columns, so the new options
  // don't visibly change this table much. The point is to use the
  // unified primitive.
  formatTable(rows, {});
}
