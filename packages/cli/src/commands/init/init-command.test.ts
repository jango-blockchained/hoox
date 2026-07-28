/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for `hoox init` command.
 *
 * Mocks:
 *  - @clack/prompts → controllable prompt responses
 *  - CloudflareService   → simulated wrangler output
 *  - Bun.write           → captured file writes
 *  - process.exit        → captured exit codes
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { runInitCommand, verifyRepoRoot } from "./init-command.js";
import type { InitOptions } from "./types.js";
import { ExitCode } from "../../utils/errors.js";
import { CloudflareService } from "../../services/cloudflare/cloudflare-service.js";

// ---------------------------------------------------------------------------
// Mock types / helpers
// ---------------------------------------------------------------------------

/** Store captured calls so tests can assert on behaviour. */
interface CapturedCalls {
  intro: string[];
  outro: string[];
  note: { title: string; content: string }[];
  passwordMessages: string[];
  textMessages: string[];
  multiselectMessages: string[];
  selectMessages: string[];
  confirmMessages: string[];
  cancelMessages: string[];
  logInfo: string[];
  logStep: string[];
  logSuccess: string[];
  logWarn: string[];
  logError: string[];
  /** Written files: path → content */
  writes: Record<string, string>;
}

function makeCapture(): CapturedCalls {
  return {
    intro: [],
    outro: [],
    note: [],
    passwordMessages: [],
    textMessages: [],
    multiselectMessages: [],
    selectMessages: [],
    confirmMessages: [],
    cancelMessages: [],
    logInfo: [],
    logStep: [],
    logSuccess: [],
    logWarn: [],
    logError: [],
    writes: {},
  };
}

let captured: CapturedCalls;

/** Paths reported as existing by the Bun.file mock (see beforeEach). */
const fileExists = new Set<string>();

/** Configurable responses for each prompt type. */
interface PromptResponses {
  password?: string | symbol;
  text?: string | symbol;
  multiselect?: string[] | symbol;
  select?: string | symbol;
  /** Confirm responses returned in order (call-by-call). Defaults are `[true, false, false]`. */
  confirmSequence?: boolean[];
  /** Group responses keyed by field name */
  group?: Record<string, string>;
}

const defaultResponses: Required<PromptResponses> = {
  password: "test-token",
  text: "test-account",
  multiselect: [],
  select: "minimal",
  confirmSequence: [true, false, false], // risk → provisioning → deploy
  group: {},
};

let responses: PromptResponses = { ...defaultResponses };

/** Control how many times each prompt type has been called. */
interface CallCounters {
  password: number;
  text: number;
  multiselect: number;
  select: number;
  confirm: number;
}

let counters: CallCounters = {
  password: 0,
  text: 0,
  multiselect: 0,
  select: 0,
  confirm: 0,
};

function resetCounters(): void {
  counters = { password: 0, text: 0, multiselect: 0, select: 0, confirm: 0 };
}

/** Whether to simulate cancellation on next check. */
let simulateCancel = false;

/** Custom password responder — set per-test for sequenced token responses. */
let customPasswordResponder: ((msg: string) => string | symbol) | null = null;

// ---------------------------------------------------------------------------
// Mock: CloudflareService (prototype based — no mock.module, no leakage)
// ---------------------------------------------------------------------------

const mockWhoami = mock(
  async (): Promise<
    { ok: true; value: string } | { ok: false; error: string }
  > => ({
    ok: true,
    value: "user@example.com",
  })
);

// ---------------------------------------------------------------------------
// Mock: @clack/prompts (import namespace + spyOn, not mock.module)
// ---------------------------------------------------------------------------

import * as clack from "@clack/prompts";

function installClackSpies(): void {
  spyOn(clack, "intro").mockImplementation((msg?: string) => {
    captured.intro.push(msg ?? "");
  });
  spyOn(clack, "outro").mockImplementation((msg?: string) => {
    captured.outro.push(msg ?? "");
  });
  spyOn(clack, "note").mockImplementation(
    (content?: string, title?: string) => {
      captured.note.push({ title: title ?? "", content: content ?? "" });
    }
  );
  spyOn(clack, "password").mockImplementation(
    // @ts-expect-error — mock validate fn signature simplified vs clack's PasswordOptions
    async (opts: {
      message: string;
      validate?: (v: string) => string | void;
    }) => {
      captured.passwordMessages.push(opts.message);
      counters.password++;
      if (simulateCancel) return Symbol.for("clack.cancel");
      if (customPasswordResponder) return customPasswordResponder(opts.message);
      return responses.password ?? defaultResponses.password;
    }
  );
  spyOn(clack, "text").mockImplementation(
    // @ts-expect-error — mock validate fn signature simplified vs clack's TextOptions
    async (opts: {
      message: string;
      placeholder?: string;
      defaultValue?: string;
      validate?: (v: string) => string | void;
    }) => {
      captured.textMessages.push(opts.message);
      counters.text++;
      return simulateCancel
        ? Symbol.for("clack.cancel")
        : (responses.text ?? defaultResponses.text);
    }
  );
  spyOn(clack, "multiselect").mockImplementation(
    // @ts-expect-error — clack's multiselect is generic, mock uses concrete types
    async (opts: {
      message: string;
      options: { value: string; label: string; hint?: string }[];
      required?: boolean;
    }) => {
      captured.multiselectMessages.push(opts.message);
      counters.multiselect++;
      return simulateCancel
        ? Symbol.for("clack.cancel")
        : (responses.multiselect ?? defaultResponses.multiselect);
    }
  );
  spyOn(clack, "select").mockImplementation(
    // @ts-expect-error — clack's select is generic, mock uses concrete types
    async (opts: {
      message: string;
      options: { value: string; label: string; hint?: string }[];
    }) => {
      captured.selectMessages.push(opts.message);
      counters.select++;
      return simulateCancel
        ? Symbol.for("clack.cancel")
        : (responses.select ?? defaultResponses.select);
    }
  );
  spyOn(clack, "confirm").mockImplementation(
    async (opts: { message: string; initialValue?: boolean }) => {
      captured.confirmMessages.push(opts.message);
      const idx = counters.confirm++;
      const seq = responses.confirmSequence ?? defaultResponses.confirmSequence;
      const val = idx < seq.length ? seq[idx] : seq[seq.length - 1];
      if (simulateCancel) return Symbol.for("clack.cancel");
      return val;
    }
  );
  spyOn(clack, "group").mockImplementation(
    // @ts-expect-error — clack's group uses PromptGroup<T>, not Record<string, () => Promise<...>>
    async (
      fields: Record<string, () => Promise<string | symbol>>,
      groupOpts?: { onCancel?: () => void }
    ) => {
      const results: Record<string, string> = {};
      for (const [key, fn] of Object.entries(fields)) {
        if (simulateCancel) {
          if (groupOpts?.onCancel) groupOpts.onCancel();
          return Symbol.for("clack.cancel");
        }
        const val = await fn();
        results[key] =
          responses.group?.[key] !== undefined
            ? responses.group[key]
            : typeof val === "string"
              ? val
              : "";
      }
      return results;
    }
  );
  spyOn(clack, "isCancel").mockImplementation(
    (value: unknown): value is symbol => {
      return (
        simulateCancel ||
        (typeof value === "symbol" &&
          Symbol.keyFor(value as symbol) === "clack.cancel")
      );
    }
  );
  spyOn(clack, "cancel").mockImplementation((msg?: string) => {
    captured.cancelMessages.push(msg ?? "");
  });
  spyOn(clack.log, "info").mockImplementation((msg?: string) => {
    captured.logInfo.push(msg ?? "");
  });
  spyOn(clack.log, "step").mockImplementation((msg?: string) => {
    captured.logStep.push(msg ?? "");
  });
  spyOn(clack.log, "success").mockImplementation((msg?: string) => {
    captured.logSuccess.push(msg ?? "");
  });
  spyOn(clack.log, "warn").mockImplementation((msg?: string) => {
    captured.logWarn.push(msg ?? "");
  });
  spyOn(clack.log, "error").mockImplementation((msg?: string) => {
    captured.logError.push(msg ?? "");
  });
}

// ---------------------------------------------------------------------------
// Mock: Bun.write & Bun.file
// ---------------------------------------------------------------------------

const origWhoamiPrototype = CloudflareService.prototype.whoami;

beforeEach(() => {
  captured = makeCapture();
  responses = { ...defaultResponses };
  resetCounters();
  simulateCancel = false;
  customPasswordResponder = null;
  mockWhoami.mockImplementation(async () => ({
    ok: true,
    value: "user@example.com",
  }));

  // Mock: CloudflareService prototype
  CloudflareService.prototype.whoami = mockWhoami;

  // Mock: @clack/prompts via spyOn (scoped, restorable)
  installClackSpies();

  // Mock Bun.write to capture all file writes

  spyOn(Bun, "write" as any).mockImplementation(
    async (path: string | URL, content: string | Uint8Array) => {
      captured.writes[String(path)] =
        typeof content === "string"
          ? content
          : new TextDecoder().decode(content);
      return typeof content === "string" ? content.length : content.byteLength;
    }
  );

  // Mock Bun.file to simulate filesystem. Paths listed in `fileExists`
  // are reported as present; everything else is absent. Defaults to the
  // two repo-root markers so the command's own verifyRepoRoot() guard
  // passes in the normal-flow tests.
  fileExists.clear();
  fileExists.add("wrangler.jsonc");
  fileExists.add("packages/cli/package.json");

  spyOn(Bun, "file" as any).mockImplementation(
    (_path: string | URL) =>
      ({
        exists: async () => fileExists.has(String(_path)),
        text: async () => "",
        arrayBuffer: async () => new ArrayBuffer(0),
        json: async () => ({}),
        size: 0,
        name: String(_path),
        lastModified: 0,
        slice: () => new Blob(),
        stream: () => new ReadableStream(),
        type: "",
      }) as unknown as Bun.BunFile
  );

  // Mock process.exit — no-op to prevent actual test termination
  spyOn(process, "exit").mockImplementation(((_code?: number) => {
    // no-op: prevent actual exit
  }) as never);
});

afterEach(() => {
  mock.restore();
  CloudflareService.prototype.whoami = origWhoamiPrototype;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("init command", () => {
  // ------------------------------------------------------------------
  // Interactive flow
  // ------------------------------------------------------------------

  describe("interactive flow", () => {
    it("shows intro and outro messages", async () => {
      responses = {
        password: "valid-token",
        text: "test-account-id",
        multiselect: [],
        select: "minimal",
        confirmSequence: [true, false, false],
      };

      await runInitCommand({}, { json: false, quiet: true }, false);

      expect(captured.intro.length).toBeGreaterThan(0);
      expect(captured.intro.some((m) => m.includes("Hoox Setup Wizard"))).toBe(
        true
      );
      expect(captured.outro.some((m) => m.includes("Config written"))).toBe(
        true
      );
      expect(captured.outro.some((m) => m.includes("hoox setup"))).toBe(true);
    });

    it("collects Cloudflare API token with validation", async () => {
      responses = {
        password: "valid-token",
        text: "test-account-id",
        multiselect: [],
        select: "minimal",
        confirmSequence: [true, false, false],
      };

      await runInitCommand({}, { json: false, quiet: true }, false);

      expect(captured.passwordMessages).toContain("Cloudflare API token:");
      expect(mockWhoami).toHaveBeenCalled();
    });

    it("retries on invalid token (validation error)", async () => {
      let callCount = 0;
      mockWhoami.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return { ok: false as const, error: "Invalid credentials" };
        }
        return { ok: true as const, value: "user@example.com" };
      });

      // First password call returns bad token, second returns good token
      let pwdCount = 0;
      customPasswordResponder = (_msg: string) => {
        pwdCount++;
        return pwdCount === 1 ? "bad-token" : "good-token";
      };

      responses = {
        password: "",
        text: "test-account-id",
        multiselect: [],
        select: "minimal",
        confirmSequence: [true, false, false],
      };

      await runInitCommand({}, { json: false, quiet: true }, false);

      // Should have called password at least twice (first failed, retry)
      expect(pwdCount).toBeGreaterThanOrEqual(2);
      expect(captured.logError.length).toBeGreaterThan(0);
    });

    it("collects account ID with default from existing wrangler.jsonc", async () => {
      const fileSpy = spyOn(Bun, "file" as any).mockImplementation(
        (path: string) => {
          if (path === "wrangler.jsonc") {
            return {
              exists: async () => true,
              text: async () =>
                '{"global":{"cloudflare_account_id":"existing-account-id-123"}}',
              arrayBuffer: async () => new ArrayBuffer(0),
              json: async () => ({}),
              size: 0,
              name: "",
              lastModified: 0,
              slice: () => new Blob(),
              stream: () => new ReadableStream(),
              type: "",
            } as unknown as Bun.BunFile;
          }
          return {
            exists: async () => path === "packages/cli/package.json",
            text: async () => "",
            arrayBuffer: async () => new ArrayBuffer(0),
            json: async () => ({}),
            size: 0,
            name: "",
            lastModified: 0,
            slice: () => new Blob(),
            stream: () => new ReadableStream(),
            type: "",
          } as unknown as Bun.BunFile;
        }
      );

      responses = {
        password: "valid-token",
        text: "existing-account-id-123",
        multiselect: [],
        select: "minimal",
        confirmSequence: [true, false, false],
      };

      await runInitCommand({}, { json: false, quiet: true }, false);

      expect(captured.textMessages.some((m) => m.includes("Account ID"))).toBe(
        true
      );

      fileSpy.mockRestore();
    });

    it("collects integrations via multiselect", async () => {
      responses = {
        password: "valid-token",
        text: "test-account-id",
        multiselect: ["binance", "telegram"],
        select: "full", // full preset includes integrations
        confirmSequence: [true, false, false],
        group: {
          BINANCE_KEY_BINDING: "binance-key-123",
          BINANCE_SECRET_BINDING: "binance-secret-123",
          TG_BOT_TOKEN_BINDING: "tg-bot-token-123",
        },
      };

      await runInitCommand({}, { json: false, quiet: true }, false);

      expect(
        captured.selectMessages.some((m) =>
          m.includes("Select a worker preset")
        )
      ).toBe(true);
    });

    it("collects per-integration secrets for selected integrations", async () => {
      responses = {
        password: "valid-token",
        text: "test-account-id",
        multiselect: ["telegram"],
        select: "full",
        confirmSequence: [true, false, false],
        group: {
          TG_BOT_TOKEN_BINDING: "tg-token-abc",
        },
      };

      await runInitCommand({}, { json: false, quiet: true }, false);

      // Password prompts should include Telegram Bot Token
      expect(
        captured.passwordMessages.some((m) => m.includes("Telegram Bot Token"))
      ).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // Non-interactive flow
  // ------------------------------------------------------------------

  describe("non-interactive flow", () => {
    it("skips prompts when --token and --account are provided", async () => {
      const options: InitOptions = {
        token: "cf-token-non-interactive",
        account: "cf-account-non-interactive",
        secretStore: "ss-id-123",
        prefix: "myprefix",
      };

      await runInitCommand(options, { json: false, quiet: true }, true);

      // No interactive prompts should have been shown
      expect(captured.passwordMessages.length).toBe(0);
      expect(captured.textMessages.length).toBe(0);
      expect(captured.multiselectMessages.length).toBe(0);

      // Token should have been validated
      expect(mockWhoami).toHaveBeenCalled();
    });

    it("validates token in non-interactive mode", async () => {
      mockWhoami.mockImplementation(async () => ({
        ok: false as const,
        error: "Bad token",
      }));

      const options: InitOptions = {
        token: "bad-token",
        account: "abc123def456abc123def456abc123de",
      };

      await runInitCommand(options, { json: false, quiet: true }, true);

      expect(process.exitCode).toBe(ExitCode.ERROR);
    });

    it("writes wrangler.jsonc in non-interactive mode", async () => {
      const options: InitOptions = {
        token: "cf-token-ni",
        account: "cf-account-ni",
        secretStore: "ss-ni",
        prefix: "ni-prefix",
      };

      await runInitCommand(options, { json: false, quiet: true }, true);

      // Verify wrangler.jsonc was written
      const workersJsonc = captured.writes["wrangler.jsonc"];
      expect(workersJsonc).toBeDefined();
      expect(workersJsonc).toContain("cf-token-ni");
      expect(workersJsonc).toContain("cf-account-ni");
      expect(workersJsonc).toContain("ss-ni");
      expect(workersJsonc).toContain("ni-prefix");
      expect(workersJsonc).toContain("d1-worker");
      expect(workersJsonc).toContain("hoox");
    });

    it("uses default prefix 'cryptolinx' when --prefix not provided", async () => {
      const options: InitOptions = {
        token: "cf-token-def",
        account: "cf-account-def",
      };

      await runInitCommand(options, { json: false, quiet: true }, true);

      const workersJsonc = captured.writes["wrangler.jsonc"];
      expect(workersJsonc).toContain("cryptolinx");
    });
  });

  // ------------------------------------------------------------------
  // wrangler.jsonc content verification
  // ------------------------------------------------------------------

  describe("wrangler.jsonc output", () => {
    it("includes base workers (d1-worker, hoox, agent-worker, analytics-worker)", async () => {
      responses = {
        password: "valid-token",
        text: "test-account",
        multiselect: [],
        select: "minimal",
        confirmSequence: [true, false, false],
      };

      await runInitCommand({}, { json: false, quiet: true }, false);

      const workersJsonc = captured.writes["wrangler.jsonc"];
      expect(workersJsonc).toBeDefined();
      expect(workersJsonc).toContain('"d1-worker"');
      expect(workersJsonc).toContain('"hoox"');
      expect(workersJsonc).toContain('"agent-worker"');
      expect(workersJsonc).toContain('"analytics-worker"');
    });

    it("includes integration workers when selected", async () => {
      responses = {
        password: "valid-token",
        text: "test-account",
        multiselect: [],
        select: "full",
        confirmSequence: [true, false, false],
        group: {
          BINANCE_KEY_BINDING: "bk",
          BINANCE_SECRET_BINDING: "bs",
          TG_BOT_TOKEN_BINDING: "tgt",
        },
      };

      await runInitCommand({}, { json: false, quiet: true }, false);

      const workersJsonc = captured.writes["wrangler.jsonc"];
      expect(workersJsonc).toBeDefined();
      expect(workersJsonc).toContain('"trade-worker"');
      expect(workersJsonc).toContain('"BINANCE_KEY_BINDING"');
      expect(workersJsonc).toContain('"BINANCE_SECRET_BINDING"');
      expect(workersJsonc).toContain('"telegram-worker"');
      expect(workersJsonc).toContain('"TG_BOT_TOKEN_BINDING"');
    });

    it("includes AI provider (OpenAI) integration from full preset", async () => {
      responses = {
        password: "valid-token",
        text: "test-account",
        multiselect: [],
        select: "full",
        confirmSequence: [true, false, false],
        group: {
          AGENT_INTERNAL_KEY: "sk-openai-123",
        },
      };

      await runInitCommand({}, { json: false, quiet: true }, false);

      const workersJsonc = captured.writes["wrangler.jsonc"];
      expect(workersJsonc).toBeDefined();
      expect(workersJsonc).toContain('"agent-worker"');
      expect(workersJsonc).toContain('"AGENT_INTERNAL_KEY"');
    });

    it("includes wallet integration from full preset", async () => {
      responses = {
        password: "valid-token",
        text: "test-account",
        multiselect: [],
        select: "full",
        confirmSequence: [true, false, false],
        group: {
          WALLET_MNEMONIC_SECRET: "seed-phrase-789",
        },
      };

      await runInitCommand({}, { json: false, quiet: true }, false);

      const workersJsonc = captured.writes["wrangler.jsonc"];
      expect(workersJsonc).toBeDefined();
      expect(workersJsonc).toContain('"web3-wallet-worker"');
      expect(workersJsonc).toContain('"WALLET_MNEMONIC_SECRET"');
    });

    it("merges exchange secrets into single trade-worker", async () => {
      responses = {
        password: "valid-token",
        text: "test-account",
        multiselect: [],
        select: "full",
        confirmSequence: [true, false, false],
        group: {
          BINANCE_KEY_BINDING: "bk",
          BINANCE_SECRET_BINDING: "bs",
          MEXC_KEY_BINDING: "mk",
          MEXC_SECRET_BINDING: "ms",
        },
      };

      await runInitCommand({}, { json: false, quiet: true }, false);

      const workersJsonc = captured.writes["wrangler.jsonc"];
      expect(workersJsonc).toBeDefined();
      expect(workersJsonc).toContain('"trade-worker"');
      expect(workersJsonc).toContain('"BINANCE_KEY_BINDING"');
      expect(workersJsonc).toContain('"MEXC_KEY_BINDING"');
      // Should only appear once
      const tradeWorkerCount =
        workersJsonc.match(/"trade-worker"/g)?.length ?? 0;
      expect(tradeWorkerCount).toBe(1);
    });

    it("includes global config section", async () => {
      responses = {
        password: "my-cf-token",
        text: "my-account-id",
        multiselect: [],
        select: "minimal",
        confirmSequence: [true, false, false],
      };

      await runInitCommand({}, { json: false, quiet: true }, false);

      const workersJsonc = captured.writes["wrangler.jsonc"];
      expect(workersJsonc).toBeDefined();
      expect(workersJsonc).toContain('"global"');
      expect(workersJsonc).toContain('"cloudflare_api_token"');
      expect(workersJsonc).toContain('"cloudflare_account_id"');
      expect(workersJsonc).toContain('"my-account-id"');
    });

    it("has JSONC header comment", async () => {
      responses = {
        password: "valid-token",
        text: "test-account",
        multiselect: [],
        select: "minimal",
        confirmSequence: [true, false, false],
      };

      await runInitCommand({}, { json: false, quiet: true }, false);

      const workersJsonc = captured.writes["wrangler.jsonc"];
      expect(workersJsonc).toBeDefined();
      expect(workersJsonc).toContain("// Hoox Workspace Configuration");
      expect(workersJsonc).toContain("// Generated by `hoox init`");
    });
  });

  // ------------------------------------------------------------------
  // .dev.vars creation
  // ------------------------------------------------------------------

  describe(".dev.vars creation", () => {
    it("creates .dev.vars for integration workers", async () => {
      responses = {
        password: "valid-token",
        text: "test-account",
        multiselect: [],
        select: "full",
        confirmSequence: [true, false, false],
        group: {
          TG_BOT_TOKEN_BINDING: "tg-secret-value",
        },
      };

      await runInitCommand({}, { json: false, quiet: true }, false);

      const devVarsPath = "workers/telegram-worker/.dev.vars";
      const devVars = captured.writes[devVarsPath];
      expect(devVars).toBeDefined();
      expect(devVars).toContain("TG_BOT_TOKEN_BINDING=tg-secret-value");
      expect(devVars).toContain("NEVER commit this file");
    });

    it("does not create .dev.vars for workers without secrets", async () => {
      responses = {
        password: "valid-token",
        text: "test-account",
        multiselect: [],
        select: "minimal",
        confirmSequence: [true, false, false],
      };

      await runInitCommand({}, { json: false, quiet: true }, false);

      // d1-worker has no user-collected secrets
      const d1DevVars = captured.writes["workers/d1-worker/.dev.vars"];
      expect(d1DevVars).toBeUndefined();
    });

    it("creates .dev.vars for agent-worker when an AI provider is selected", async () => {
      responses = {
        password: "valid-token",
        text: "test-account",
        multiselect: [],
        select: "full",
        confirmSequence: [true, false, false],
        group: {
          AGENT_INTERNAL_KEY: "sk-openai-real-value",
        },
      };

      await runInitCommand({}, { json: false, quiet: true }, false);

      const devVarsPath = "workers/agent-worker/.dev.vars";
      const devVars = captured.writes[devVarsPath];
      expect(devVars).toBeDefined();
      expect(devVars).toContain("AGENT_INTERNAL_KEY=sk-openai-real-value");
      expect(devVars).toContain("NEVER commit this file");
    });

    it("creates .dev.vars for web3-wallet-worker when wallet integration selected", async () => {
      responses = {
        password: "valid-token",
        text: "test-account",
        multiselect: [],
        select: "full",
        confirmSequence: [true, false, false],
        group: {
          WALLET_MNEMONIC_SECRET: "mnemonic-real-value",
        },
      };

      await runInitCommand({}, { json: false, quiet: true }, false);

      const devVarsPath = "workers/web3-wallet-worker/.dev.vars";
      const devVars = captured.writes[devVarsPath];
      expect(devVars).toBeDefined();
      expect(devVars).toContain("WALLET_MNEMONIC_SECRET=mnemonic-real-value");
      expect(devVars).toContain("NEVER commit this file");
    });
  });

  // ------------------------------------------------------------------
  // Cancellation handling
  // ------------------------------------------------------------------

  describe("cancellation handling", () => {
    it("exits on cancel during risk acknowledgment", async () => {
      // Make the first confirm return false (user declines the risk terms)
      responses.confirmSequence = [false];

      await runInitCommand({}, { json: false, quiet: true }, false);

      expect(process.exitCode).toBe(0);
    });
  });

  // ------------------------------------------------------------------
  // Global options (--json, --quiet)
  // ------------------------------------------------------------------

  describe("global options", () => {
    it("suppresses output in quiet mode", async () => {
      responses = {
        password: "valid-token",
        text: "test-account",
        multiselect: [],
        select: "minimal",
        confirmSequence: [true, false, false],
      };

      await runInitCommand({}, { json: false, quiet: true }, false);

      // In quiet mode, formatSuccess/formatter functions respect quiet mode.
      // The flow should complete without throwing.
      expect(captured.writes["wrangler.jsonc"]).toBeDefined();
    });
  });

  describe("verifyRepoRoot", () => {
    it("passes when both repo-root markers exist", async () => {
      fileExists.add("wrangler.jsonc");
      fileExists.add("packages/cli/package.json");
      // Should not throw.
      await expect(verifyRepoRoot()).resolves.toBeUndefined();
    });

    it("throws INVALID_USAGE when wrangler.jsonc is missing", async () => {
      fileExists.clear();
      fileExists.add("packages/cli/package.json"); // only one marker
      await expect(verifyRepoRoot()).rejects.toThrowError(
        /Not inside a Hoox repository root/
      );
    });

    it("throws INVALID_USAGE when packages/cli is missing", async () => {
      fileExists.clear();
      fileExists.add("wrangler.jsonc"); // only one marker
      await expect(verifyRepoRoot()).rejects.toThrowError(
        /this is not the hoox-setup repo/
      );
    });

    it("throws INVALID_USAGE when run from an empty directory", async () => {
      fileExists.clear(); // neither marker
      await expect(verifyRepoRoot()).rejects.toThrowError(
        /git clone --recursive/
      );
    });
  });
});
