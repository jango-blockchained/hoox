/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * useKeyboard — Priority-ordered keyboard handler hook.
 *
 * Registers a keypress handler with a priority. Higher priority handlers
 * can stop propagation to lower ones. Cleans up on unmount.
 *
 * Priority convention:
 *   0   — Modal/dialog (highest)
 *   10  — View-local shortcuts
 *   50  — App-global shortcuts
 *   100 — Default/passthrough
 */
import { useEffect, useRef } from "react";
import { getRendererRef } from "./renderer-ref";

export interface KeyEvent {
  name: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  sequence: string;
}

export interface UseKeyboardOptions {
  priority?: number;
  enabled?: boolean;
}

type KeyHandler = (key: KeyEvent) => void;

interface RegisteredHandler {
  handler: KeyHandler;
  priority: number;
}

const globalHandlers: RegisteredHandler[] = [];

export function registerGlobalHandler(
  handler: KeyHandler,
  priority = 50
): () => void {
  const entry: RegisteredHandler = { handler, priority };
  globalHandlers.push(entry);
  globalHandlers.sort((a, b) => a.priority - b.priority);
  return () => {
    const idx = globalHandlers.indexOf(entry);
    if (idx >= 0) globalHandlers.splice(idx, 1);
  };
}

export function useKeyboard(
  handler: KeyHandler,
  options: UseKeyboardOptions = {}
): void {
  const { priority = 10, enabled = true } = options;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    const wrapped: KeyHandler = (key) => handlerRef.current(key);
    const entry: RegisteredHandler = { handler: wrapped, priority };
    globalHandlers.push(entry);
    globalHandlers.sort((a, b) => a.priority - b.priority);

    return () => {
      const idx = globalHandlers.indexOf(entry);
      if (idx >= 0) globalHandlers.splice(idx, 1);
    };
  }, [priority, enabled]);

  // Register with the renderer on first mount
  useEffect(() => {
    const renderer = getRendererRef();
    if (!renderer) return;

    const cleanup = renderer.keyInput.on("keypress", (key: unknown) => {
      for (const { handler: h } of globalHandlers) {
        h(key as KeyEvent);
      }
    });

    return cleanup;
  }, []);
}
