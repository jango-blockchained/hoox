/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, mock } from "bun:test";
import { RepairService } from "./repair-service.js";
import type { CloudflareService } from "../../services/cloudflare/index.js";
import type { SecretsService } from "../../services/secrets/index.js";

function makeSpawn(exitCodes: Record<string, number>) {
  return mock((args: string[]) => {
    const key = args.join(" ");
    const code =
      exitCodes[key] ??
      exitCodes[args.slice(0, 3).join(" ")] ??
      exitCodes["*"] ??
      0;
    return {
      exited: Promise.resolve(code),
      stdout: new ReadableStream(),
      stderr: new ReadableStream(),
    };
  }) as unknown as typeof Bun.spawn;
}

function okCf(): CloudflareService {
  return {
    d1List: mock(async () => ({ ok: true as const, value: [] })),
    kvList: mock(async () => ({ ok: true as const, value: [] })),
    r2List: mock(async () => ({ ok: true as const, value: [] })),
    queueList: mock(async () => ({ ok: true as const, value: [] })),
  } as unknown as CloudflareService;
}

function failCf(): CloudflareService {
  return {
    d1List: mock(async () => ({ ok: false as const, error: "auth" })),
    kvList: mock(async () => ({ ok: true as const, value: [] })),
    r2List: mock(async () => ({ ok: true as const, value: [] })),
    queueList: mock(async () => ({ ok: true as const, value: [] })),
  } as unknown as CloudflareService;
}

describe("RepairService.runSystemCheck", () => {
  it("skips bun install by default and reports allPassed when deps ok", async () => {
    const spawn = makeSpawn({
      "bun run check:worker-submodules": 0,
      "bun run typecheck": 0,
    });
    const svc = new RepairService({
      spawn,
      cloudflare: okCf(),
      createSecrets: async () =>
        ({
          listAllSecrets: () => ({ hoox: ["A"] }),
          checkLocalSecrets: async () => ({
            secrets: ["A"],
            missing: [],
            present: ["A"],
          }),
        }) as unknown as SecretsService,
      validateSchema: async () => [{ errors: [] }],
    });

    const result = await svc.runSystemCheck({ typecheck: true });

    expect(result.allPassed).toBe(true);
    expect(result.failedCount).toBe(0);
    const deps = result.steps.find((s) => s.step === "Dependencies");
    expect(deps?.success).toBe(true);
    expect(deps?.message).toContain("Skipped");
    // install must not have been spawned
    const installCalls = (spawn as ReturnType<typeof mock>).mock.calls.filter(
      (c) => (c[0] as string[]).join(" ") === "bun install"
    );
    expect(installCalls).toHaveLength(0);
  });

  it("runs bun install when installDeps is true", async () => {
    const spawn = makeSpawn({
      "bun run check:worker-submodules": 0,
      "bun install": 0,
      "bun run typecheck": 0,
    });
    const svc = new RepairService({
      spawn,
      cloudflare: okCf(),
      createSecrets: async () =>
        ({
          listAllSecrets: () => ({}),
          checkLocalSecrets: async () => ({
            secrets: [],
            missing: [],
            present: [],
          }),
        }) as unknown as SecretsService,
      validateSchema: async () => [{ errors: [] }],
    });

    await svc.runSystemCheck({ installDeps: true, typecheck: true });
    const installCalls = (spawn as ReturnType<typeof mock>).mock.calls.filter(
      (c) => (c[0] as string[]).join(" ") === "bun install"
    );
    expect(installCalls.length).toBe(1);
  });

  it("marks infrastructure failed when D1 list fails", async () => {
    const spawn = makeSpawn({ "*": 0 });
    const svc = new RepairService({
      spawn,
      cloudflare: failCf(),
      createSecrets: async () =>
        ({
          listAllSecrets: () => ({}),
          checkLocalSecrets: async () => ({
            secrets: [],
            missing: [],
            present: [],
          }),
        }) as unknown as SecretsService,
      validateSchema: async () => [{ errors: [] }],
    });

    const result = await svc.runSystemCheck({ typecheck: false });
    expect(result.allPassed).toBe(false);
    const infra = result.steps.find((s) => s.step === "Infrastructure");
    expect(infra?.success).toBe(false);
    expect(infra?.message).toContain("D1: ✗");
  });

  it("reports missing secrets", async () => {
    const spawn = makeSpawn({ "*": 0 });
    const svc = new RepairService({
      spawn,
      cloudflare: okCf(),
      createSecrets: async () =>
        ({
          listAllSecrets: () => ({ "trade-worker": ["API_KEY"] }),
          checkLocalSecrets: async () => ({
            secrets: ["API_KEY"],
            missing: ["API_KEY"],
            present: [],
          }),
        }) as unknown as SecretsService,
      validateSchema: async () => [{ errors: [] }],
    });

    const result = await svc.runSystemCheck({ typecheck: false });
    const secrets = result.steps.find((s) => s.step === "Secrets");
    expect(secrets?.success).toBe(false);
    expect(secrets?.message).toContain("missing");
  });

  it("captures spawn throw as step error", async () => {
    const spawn = mock(() => {
      throw new Error("spawn boom");
    }) as unknown as typeof Bun.spawn;
    const svc = new RepairService({
      spawn,
      cloudflare: okCf(),
      createSecrets: async () =>
        ({
          listAllSecrets: () => ({}),
          checkLocalSecrets: async () => ({
            secrets: [],
            missing: [],
            present: [],
          }),
        }) as unknown as SecretsService,
      validateSchema: async () => [{ errors: [] }],
    });

    const result = await svc.runSystemCheck({ typecheck: false });
    const sub = result.steps.find((s) => s.step === "Worker submodules");
    expect(sub?.success).toBe(false);
    expect(sub?.error).toContain("spawn boom");
  });
});
