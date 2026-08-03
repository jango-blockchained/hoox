/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for file-backed TUI state storage (Bun has no localStorage).
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { unlink } from "fs/promises";
import {
  readJsonState,
  writeJsonState,
  removeJsonState,
  TuiStateFiles,
} from "./tui-storage";
import { resolveTuiStatePath, ensureTuiStateDir } from "./hoox-path-service";

const TEST_FILE = "tui-storage-test.json";

describe("tui-storage", () => {
  beforeEach(async () => {
    await ensureTuiStateDir();
    await removeJsonState(TEST_FILE);
  });

  afterEach(async () => {
    await removeJsonState(TEST_FILE);
  });

  it("returns fallback when file does not exist", async () => {
    const value = await readJsonState(TEST_FILE, { empty: true });
    expect(value).toEqual({ empty: true });
  });

  it("round-trips JSON values", async () => {
    const payload = { messages: [{ role: "user", content: "hi" }], n: 2 };
    await writeJsonState(TEST_FILE, payload);
    const loaded = await readJsonState<typeof payload | null>(TEST_FILE, null);
    expect(loaded).toEqual(payload);
  });

  it("removeJsonState deletes the file", async () => {
    await writeJsonState(TEST_FILE, { gone: false });
    await removeJsonState(TEST_FILE);
    const loaded = await readJsonState(TEST_FILE, { gone: true });
    expect(loaded).toEqual({ gone: true });
  });

  it("exports well-known state file names", () => {
    expect(TuiStateFiles.chatHistory).toBe("chat-history.json");
    expect(TuiStateFiles.dbQueryHistory).toBe("db-query-history.json");
  });

  it("resolveTuiStatePath places files under .tui-state", () => {
    const path = resolveTuiStatePath(TuiStateFiles.chatHistory);
    expect(path.includes(".tui-state")).toBe(true);
    expect(path.endsWith("chat-history.json")).toBe(true);
  });

  it("removeJsonState is idempotent for missing files", async () => {
    await expect(
      removeJsonState("definitely-missing-xyz.json")
    ).resolves.toBeUndefined();
    // Extra safety: unlink of missing path must not throw either
    await unlink(resolveTuiStatePath("definitely-missing-xyz.json")).catch(
      () => undefined
    );
  });
});
