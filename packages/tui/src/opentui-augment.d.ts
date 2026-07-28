/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Augment @opentui/core types that aren't resolved correctly through Bun's symlink chain.
 * This file fixes TS2305 errors by declaring the missing exports that exist at runtime.
 */

// CliRenderer and createCliRenderer are exported from @opentui/core/renderer.d.ts
// but the re-export through index.d.ts (export * from "./renderer.js") may not
// resolve correctly due to Bun's symlinked package resolution.
declare module "@opentui/core" {
  export interface CliRendererConfig {
    screenMode?: "main-screen" | "alternate-screen";
    exitOnCtrlC?: boolean;
    targetFps?: number;
    maxFps?: number;
    useMouse?: boolean;
    backgroundColor?: string;
    useKittyKeyboard?:
      | boolean
      | {
          disambiguate?: boolean;
          alternateKeys?: boolean;
          events?: boolean;
        };
    [key: string]: unknown;
  }

  export interface CliRenderer {
    on(event: string, handler: (...args: unknown[]) => void): void;
    destroy(): void;
    start(): void;
    keyInput: {
      on(event: string, handler: (key: unknown) => void): () => void;
    };
    [key: string]: unknown;
  }

  export function createCliRenderer(
    config?: CliRendererConfig
  ): Promise<CliRenderer>;
}
