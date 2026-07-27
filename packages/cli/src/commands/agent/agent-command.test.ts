/**
 * Unit tests for `hoox agent health` (config check + optional --probe).
 *
 * Live probes use a mocked global fetch — no real network.
 */
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Command } from "commander";
import {
  __setSecretSourceForTests,
  handleHealth,
  probeProvider,
  registerAgentCommand,
  resolveSecret,
} from "./agent-command.js";

const PROVIDER_ENV_VARS = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "AZURE_API_KEY",
  "AZURE_ENDPOINT",
  "OPENAI_API_BASE",
  "AGENT_INTERNAL_KEY",
] as const;

const origEnv: Record<string, string | undefined> = {};
const origFetch = globalThis.fetch;

function captureStreams(): {
  stdout: () => string;
  stderr: () => string;
  restore: () => void;
} {
  const out: string[] = [];
  const err: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string | Buffer) => {
    out.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Buffer) => {
    err.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stderr.write;
  return {
    stdout: () => out.join(""),
    stderr: () => err.join(""),
    restore: () => {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    },
  };
}

function clearProviderEnv(): void {
  for (const k of PROVIDER_ENV_VARS) {
    delete process.env[k];
  }
}

function setAllProviderKeys(): void {
  process.env.CLOUDFLARE_API_TOKEN = "cf-token-test-secret";
  process.env.CLOUDFLARE_ACCOUNT_ID = "acct-123";
  process.env.OPENAI_API_KEY = "sk-openai-test-secret";
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-secret";
  process.env.GOOGLE_API_KEY = "google-test-secret";
  process.env.AZURE_API_KEY = "azure-test-secret";
  process.env.AZURE_ENDPOINT = "https://example.openai.azure.com";
}

function okResponse(body: unknown = { ok: true }): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  for (const k of PROVIDER_ENV_VARS) {
    origEnv[k] = process.env[k];
  }
  clearProviderEnv();
  // Ignore on-disk .dev.vars so workspace secrets don't leak into unit tests
  __setSecretSourceForTests(() => ({}));
  process.exitCode = undefined;
  globalThis.fetch = origFetch;
});

afterEach(() => {
  for (const k of PROVIDER_ENV_VARS) {
    if (origEnv[k] === undefined) delete process.env[k];
    else process.env[k] = origEnv[k];
  }
  __setSecretSourceForTests(null);
  process.exitCode = undefined;
  globalThis.fetch = origFetch;
  mock.restore();
});

describe("registerAgentCommand", () => {
  it("registers agent health with --probe and --timeout", () => {
    const program = new Command();
    registerAgentCommand(program);
    const agent = program.commands.find((c) => c.name() === "agent");
    expect(agent).toBeDefined();
    const health = agent?.commands.find((c) => c.name() === "health");
    expect(health).toBeDefined();
    const optNames = health?.options.map((o) => o.long) ?? [];
    expect(optNames).toContain("--probe");
    expect(optNames).toContain("--timeout");
  });
});

describe("handleHealth (config-only, default)", () => {
  it("reports missing when no keys are set and exits 1", async () => {
    const cap = captureStreams();
    try {
      await handleHealth({ json: true });
    } finally {
      cap.restore();
    }
    const json = JSON.parse(cap.stdout()) as {
      providers: Array<{ name: string; status: string; note: string }>;
    };
    expect(json.providers.length).toBe(5);
    for (const p of json.providers) {
      expect(p.status).toBe("offline");
      expect(p.note).toMatch(/missing|no api key/i);
    }
    expect(process.exitCode).toBe(1);
  });

  it("reports configured for providers with keys (no network)", async () => {
    setAllProviderKeys();
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      return okResponse();
    }) as unknown as typeof fetch;

    const cap = captureStreams();
    try {
      await handleHealth({ json: true });
    } finally {
      cap.restore();
    }

    expect(fetchCalled).toBe(false);
    const json = JSON.parse(cap.stdout()) as {
      providers: Array<{
        name: string;
        status: string;
        configured: boolean;
        note: string;
        latencyMs: number | null;
      }>;
    };
    for (const p of json.providers) {
      expect(p.status).toBe("online");
      expect(p.configured).toBe(true);
      expect(p.note).toContain("not probed");
      expect(p.latencyMs).toBeNull();
    }
    expect(process.exitCode === undefined || process.exitCode === 0).toBe(true);
  });

  it("human table uses configured/missing labels", async () => {
    process.env.OPENAI_API_KEY = "sk-only-openai";
    const cap = captureStreams();
    try {
      await handleHealth({});
    } finally {
      cap.restore();
    }
    const out = cap.stdout();
    expect(out).toContain("configured");
    expect(out).toContain("missing");
    expect(out).not.toContain("sk-only-openai");
  });
});

describe("probeProvider", () => {
  it("OpenAI uses models endpoint with Bearer auth", async () => {
    const fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(url).toBe("https://api.openai.com/v1/models");
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer sk-test");
      return Promise.resolve(okResponse({ data: [] }));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await probeProvider("OpenAI", "sk-test", 5000);
    expect(result.status).toBe("online");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("Anthropic uses models endpoint with x-api-key and version header", async () => {
    const fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(url).toBe("https://api.anthropic.com/v1/models");
      const headers = new Headers(init?.headers);
      expect(headers.get("x-api-key")).toBe("ant-key");
      expect(headers.get("anthropic-version")).toBe("2023-06-01");
      return Promise.resolve(okResponse({ data: [] }));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await probeProvider("Anthropic", "ant-key", 5000);
    expect(result.status).toBe("online");
  });

  it("Anthropic falls back to messages on models 404", async () => {
    const fetchMock = mock((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/models")) {
        return Promise.resolve(new Response("not found", { status: 404 }));
      }
      if (url.includes("/v1/messages")) {
        // Auth accepted, validation error → still online
        return Promise.resolve(new Response("bad request", { status: 400 }));
      }
      return Promise.resolve(new Response("nope", { status: 500 }));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await probeProvider("Anthropic", "ant-key", 5000);
    expect(result.status).toBe("online");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("Google hits generativelanguage models with key query", async () => {
    const fetchMock = mock((input: RequestInfo | URL) => {
      const url = String(input);
      expect(
        url.startsWith(
          "https://generativelanguage.googleapis.com/v1beta/models?key="
        )
      ).toBe(true);
      expect(url).toContain("google-secret");
      return Promise.resolve(okResponse({ models: [] }));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await probeProvider("Google", "google-secret", 5000);
    expect(result.status).toBe("online");
  });

  it("Azure is degraded when endpoint is missing", async () => {
    delete process.env.AZURE_ENDPOINT;
    delete process.env.OPENAI_API_BASE;
    globalThis.fetch = mock(() =>
      Promise.resolve(okResponse())
    ) as unknown as typeof fetch;

    const result = await probeProvider("Azure", "azure-key", 5000);
    expect(result.status).toBe("degraded");
    expect(result.error).toBe("AZURE_ENDPOINT missing");
    expect(result.latencyMs).toBeNull();
  });

  it("Azure probes endpoint with api-key header", async () => {
    process.env.AZURE_ENDPOINT = "https://my.openai.azure.com/";
    const fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(url).toBe(
        "https://my.openai.azure.com/openai/models?api-version=2024-02-01"
      );
      const headers = new Headers(init?.headers);
      expect(headers.get("api-key")).toBe("azure-key");
      return Promise.resolve(okResponse({ data: [] }));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await probeProvider("Azure", "azure-key", 5000);
    expect(result.status).toBe("online");
  });

  it("Workers AI uses account models search when account id present", async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "acct-xyz";
    const fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(url).toBe(
        "https://api.cloudflare.com/client/v4/accounts/acct-xyz/ai/models/search"
      );
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer cf-token");
      return Promise.resolve(okResponse({ success: true }));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await probeProvider("Workers AI", "cf-token", 5000);
    expect(result.status).toBe("online");
  });

  it("Workers AI falls back to token verify without account id", async () => {
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    const fetchMock = mock((input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toBe(
        "https://api.cloudflare.com/client/v4/user/tokens/verify"
      );
      return Promise.resolve(okResponse({ success: true }));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await probeProvider("Workers AI", "cf-token", 5000);
    expect(result.status).toBe("degraded");
    expect(result.error).toMatch(/CLOUDFLARE_ACCOUNT_ID missing/i);
  });

  it("maps 401 to offline", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("nope", { status: 401 }))
    ) as unknown as typeof fetch;

    const result = await probeProvider("OpenAI", "bad-key", 5000);
    expect(result.status).toBe("offline");
    expect(result.error).toMatch(/401/);
  });

  it("maps network errors to offline without leaking secrets", async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error("connect ECONNREFUSED secret-sk-leaked-value"))
    ) as unknown as typeof fetch;

    const result = await probeProvider(
      "OpenAI",
      "secret-sk-leaked-value",
      5000
    );
    expect(result.status).toBe("offline");
    expect(result.error).toBeDefined();
    expect(result.error).not.toContain("secret-sk-leaked-value");
    expect(result.error).toContain("[redacted]");
  });

  it("maps timeout to offline", async () => {
    const err = new Error("The operation was aborted due to timeout");
    err.name = "TimeoutError";
    globalThis.fetch = mock(() =>
      Promise.reject(err)
    ) as unknown as typeof fetch;

    const result = await probeProvider("OpenAI", "sk-test", 10);
    expect(result.status).toBe("offline");
    expect(result.error).toMatch(/timed out/i);
  });
});

describe("handleHealth (--probe)", () => {
  it("runs parallel live probes and reports online + latency", async () => {
    setAllProviderKeys();
    const fetchMock = mock(() => Promise.resolve(okResponse({ data: [] })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const cap = captureStreams();
    try {
      await handleHealth({ json: true, probe: true, timeout: 3000 });
    } finally {
      cap.restore();
    }

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(5);
    const json = JSON.parse(cap.stdout()) as {
      probed: boolean;
      timeoutMs: number;
      providers: Array<{
        name: string;
        status: string;
        latencyMs: number | null;
        note: string;
        error?: string;
      }>;
    };
    expect(json.probed).toBe(true);
    expect(json.timeoutMs).toBe(3000);
    expect(json.providers.length).toBe(5);
    for (const p of json.providers) {
      expect(p.status).toBe("online");
      expect(p.latencyMs).toBeGreaterThanOrEqual(0);
      expect(p.note).toMatch(/\d+ms/);
    }
    expect(process.exitCode === undefined || process.exitCode === 0).toBe(true);

    // Never print secret values
    const raw = cap.stdout();
    expect(raw).not.toContain("cf-token-test-secret");
    expect(raw).not.toContain("sk-openai-test-secret");
    expect(raw).not.toContain("sk-ant-test-secret");
    expect(raw).not.toContain("google-test-secret");
    expect(raw).not.toContain("azure-test-secret");
  });

  it("exits 1 when any provider is offline", async () => {
    process.env.OPENAI_API_KEY = "sk-ok";
    // Others missing → offline

    globalThis.fetch = mock(() =>
      Promise.resolve(okResponse())
    ) as unknown as typeof fetch;

    const cap = captureStreams();
    try {
      await handleHealth({ json: true, probe: true });
    } finally {
      cap.restore();
    }

    const json = JSON.parse(cap.stdout()) as {
      providers: Array<{ name: string; status: string }>;
    };
    const openai = json.providers.find((p) => p.name === "OpenAI");
    expect(openai?.status).toBe("online");
    expect(json.providers.some((p) => p.status === "offline")).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it("treats degraded as non-fatal when none are offline", async () => {
    setAllProviderKeys();
    delete process.env.AZURE_ENDPOINT;
    delete process.env.OPENAI_API_BASE;
    // Azure will be degraded (missing endpoint); others online via fetch

    globalThis.fetch = mock(() =>
      Promise.resolve(okResponse())
    ) as unknown as typeof fetch;

    const cap = captureStreams();
    try {
      await handleHealth({ json: true, probe: true });
    } finally {
      cap.restore();
    }

    const json = JSON.parse(cap.stdout()) as {
      providers: Array<{ name: string; status: string; error?: string }>;
    };
    const azure = json.providers.find((p) => p.name === "Azure");
    expect(azure?.status).toBe("degraded");
    expect(azure?.error).toBe("AZURE_ENDPOINT missing");
    expect(json.providers.every((p) => p.status !== "offline")).toBe(true);
    expect(process.exitCode === undefined || process.exitCode === 0).toBe(true);
  });

  it("human output shows online|degraded|offline with --probe", async () => {
    process.env.OPENAI_API_KEY = "sk-ok";
    globalThis.fetch = mock(() =>
      Promise.resolve(okResponse())
    ) as unknown as typeof fetch;

    const cap = captureStreams();
    try {
      await handleHealth({ probe: true });
    } finally {
      cap.restore();
    }
    const out = cap.stdout();
    expect(out).toMatch(/online/i);
    expect(out).toMatch(/offline|missing key/i);
    expect(out).not.toContain("sk-ok");
  });

  it("marks AGENT_INTERNAL_KEY-only providers as degraded when probing", async () => {
    process.env.AGENT_INTERNAL_KEY = "internal-only-key";
    globalThis.fetch = mock(() =>
      Promise.resolve(okResponse())
    ) as unknown as typeof fetch;

    const cap = captureStreams();
    try {
      await handleHealth({ json: true, probe: true });
    } finally {
      cap.restore();
    }

    const json = JSON.parse(cap.stdout()) as {
      providers: Array<{ status: string; error?: string }>;
    };
    expect(json.providers.every((p) => p.status === "degraded")).toBe(true);
    expect(json.providers[0]?.error).toMatch(/AGENT_INTERNAL_KEY only/);
    // degraded is non-fatal
    expect(process.exitCode === undefined || process.exitCode === 0).toBe(true);
  });
});

describe("resolveSecret", () => {
  it("reads from process.env", () => {
    process.env.OPENAI_API_KEY = "from-env";
    expect(resolveSecret("OPENAI_API_KEY")).toBe("from-env");
  });

  it("reads from secret source override (.dev.vars stand-in)", () => {
    __setSecretSourceForTests(() => ({ OPENAI_API_KEY: "from-dev-vars" }));
    expect(resolveSecret("OPENAI_API_KEY")).toBe("from-dev-vars");
  });
});
