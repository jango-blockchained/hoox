/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test";
import { CLIProvisioner } from "./cli-provisioner";

describe("CLIProvisioner", () => {
  it("check returns expected resources", async () => {
    const provisioner = new CLIProvisioner();
    const result = await provisioner.check({
      d1Databases: ["hoox-db"],
      kvNamespaces: ["CONFIG_KV"],
      r2Buckets: [],
      queues: [],
    });
    expect(result.success).toBe(true);
    expect(result.created).toContain("D1:hoox-db");
    expect(result.created).toContain("KV:CONFIG_KV");
  });
});
