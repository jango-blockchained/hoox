/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * renderer-ref — Module-level singleton for the CLI renderer.
 *
 * Avoids circular imports between main.ts and hooks.
 */
import type { CliRenderer } from "@opentui/core";

let _renderer: CliRenderer | null = null;

export function setRendererRef(renderer: CliRenderer): void {
  _renderer = renderer;
}

export function getRendererRef(): CliRenderer | null {
  return _renderer;
}
