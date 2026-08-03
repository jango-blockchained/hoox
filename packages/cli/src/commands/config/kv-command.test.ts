/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { KvSyncService } from "../../services/kv/index.js";

/** Monorepo root (packages/cli/src/commands/config → ../../../../..) */
const MONOREPO_ROOT = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../../.."
);

describe("kv command", () => {
  describe("manifest", () => {
    it("returns keys from dashboard.jsonc dynamically", () => {
      const keys = KvSyncService.getManifestKeys(MONOREPO_ROOT);
      expect(keys.length).toBeGreaterThan(20);
      expect(keys.some((k) => k.key === "trade:kill_switch")).toBe(true);
      expect(keys.some((k) => k.key === "agent:openai_key")).toBe(true);
      expect(keys.some((k) => k.key === "global:kill_switch")).toBe(true);
      expect(
        keys.some((k) => k.key === "webhook:tradingview:ip_check_enabled")
      ).toBe(true);
    });

    it("returns empty keys when root has no workers", () => {
      const keys = KvSyncService.getManifestKeys("/tmp");
      expect(keys).toEqual([]);
    });
  });
});
