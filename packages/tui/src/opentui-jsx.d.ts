/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Augment @opentui/react types.
 *
 * 1. Loose JSX intrinsic element types: OpenTUI v0.2.12's `BoxProps` and `TextProps`
 *    don't include all layout/style props (fg, bg, bold, dim, flexDirection, paddingLeft, etc.)
 *    that are valid at runtime. This augmentation makes all intrinsic elements accept any props
 *    to avoid TS2322 errors throughout the codebase.
 *
 * 2. Named exports: `createRoot` and `useKeyboard` are exported from @opentui/react but
 *    may not resolve correctly through Bun's symlinked package resolution. This augmentation
 *    declares them to fix TS2305 errors.
 */

declare module "@opentui/react" {
  // JSX namespace augmentation for loose intrinsic element types
  export namespace JSX {
    interface IntrinsicElements {
      text: Record<string, unknown>;
      box: Record<string, unknown>;
      span: Record<string, unknown>;
      code: Record<string, unknown>;
      diff: Record<string, unknown>;
      markdown: Record<string, unknown>;
      input: Record<string, unknown>;
      textarea: Record<string, unknown>;
      select: Record<string, unknown>;
      scrollbox: Record<string, unknown>;
      "ascii-font": Record<string, unknown>;
      "tab-select": Record<string, unknown>;
      "line-number": Record<string, unknown>;
      b: Record<string, unknown>;
      i: Record<string, unknown>;
      u: Record<string, unknown>;
      strong: Record<string, unknown>;
      em: Record<string, unknown>;
      br: Record<string, unknown>;
      a: Record<string, unknown>;
    }
  }

  // Key event object structure from useKeyboard hook
  export interface KeyEvent {
    name: string;
    sequence: string;
    ctrl: boolean;
    alt: boolean;
    meta: boolean;
    shift: boolean;
    [key: string]: unknown;
  }

  // Named exports that may not resolve through Bun's symlink chain
  export function createRoot(
    container: unknown,
    options?: unknown
  ): {
    render(element: unknown): void;
    unmount(): void;
  };

  export function useKeyboard(
    handler?: (key: KeyEvent) => void,
    options?: unknown
  ): unknown;
}
