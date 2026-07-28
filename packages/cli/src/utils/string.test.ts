/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test";
import { levenshtein } from "./string.js";

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("deploy", "deploy")).toBe(0);
    expect(levenshtein("", "")).toBe(0);
  });

  it("returns length when one string is empty", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });

  it("counts single-character substitutions", () => {
    expect(levenshtein("cat", "bat")).toBe(1);
    expect(levenshtein("cat", "cot")).toBe(1);
  });

  it("counts insertions and deletions", () => {
    expect(levenshtein("cat", "cats")).toBe(1); // insertion
    expect(levenshtein("cats", "cat")).toBe(1); // deletion
  });

  it("computes classic examples", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("flaw", "lawn")).toBe(2);
    expect(levenshtein("saturday", "sunday")).toBe(3);
  });

  it("is symmetric", () => {
    expect(levenshtein("abc", "xyz")).toBe(levenshtein("xyz", "abc"));
  });
});
