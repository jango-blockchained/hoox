/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * String utilities used by formatters and the error handler.
 *
 * Pure, dependency-free. Keep this file small and focused.
 */

/**
 * Compute the Levenshtein (edit) distance between two strings.
 *
 * Uses the standard O(min(m,n)) space dynamic-programming algorithm.
 * `m` and `n` here are the two input lengths; we keep the smaller
 * dimension as the row to minimize memory.
 *
 * @param a - First string
 * @param b - Second string
 * @returns The minimum number of single-character edits (insertions,
 *          deletions, or substitutions) required to transform `a` into `b`.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Use the shorter string as the "row" to keep memory tight.
  const [s, t] = a.length <= b.length ? [a, b] : [b, a];
  const m = s.length;
  const n = t.length;

  // Previous row of edit distances.
  let prev = new Array<number>(m + 1);
  for (let i = 0; i <= m; i++) prev[i] = i;

  // Current row being built.
  let curr = new Array<number>(m + 1);

  for (let j = 1; j <= n; j++) {
    curr[0] = j;
    for (let i = 1; i <= m; i++) {
      const cost = s.charCodeAt(i - 1) === t.charCodeAt(j - 1) ? 0 : 1;
      curr[i] = Math.min(
        curr[i - 1] + 1, // insertion
        prev[i] + 1, // deletion
        prev[i - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[m];
}
