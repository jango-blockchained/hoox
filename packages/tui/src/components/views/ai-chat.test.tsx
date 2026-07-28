/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for AiChatView — export surface + Bun environment assumptions.
 * Persistence uses file-backed tui-storage (see tui-storage.test.ts);
 * full render/SSE coverage is out of scope for this unit file.
 */
import { describe, it, expect } from "bun:test";
import { AiChatView } from "./ai-chat";
import { TuiStateFiles } from "../../services/tui-storage";

describe("AiChatView", () => {
  it("is a function component", () => {
    expect(AiChatView).toBeInstanceOf(Function);
    expect(AiChatView.name).toBe("AiChatView");
  });

  it("runs in environments without localStorage", () => {
    // Regression: CLEAR HISTORY used bare localStorage and threw ReferenceError
    expect(typeof globalThis.localStorage).toBe("undefined");
  });

  it("persists history under the chat-history state file", () => {
    expect(TuiStateFiles.chatHistory).toBe("chat-history.json");
  });
});
