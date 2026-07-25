import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { hooxFetch, WorkerAPIError } from "../src/api-client";

describe("api-client", () => {
  const originalFetch = global.fetch;

  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("fetches successfully", async () => {
    const mockResponse = { data: "success" };
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await hooxFetch("/test");
    expect(result).toEqual(mockResponse);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("sends Bearer and Access headers from transport profile", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await hooxFetch("/v1/workers", {
      transport: {
        transport: "access",
        apiBase: "https://mgmt.example.com",
        bearerToken: "op-token",
        accessClientId: "cid",
        accessClientSecret: "csec",
      },
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://mgmt.example.com/v1/workers");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer op-token");
    expect(headers["CF-Access-Client-Id"]).toBe("cid");
    expect(headers["CF-Access-Client-Secret"]).toBe("csec");
  });

  it("throws WorkerAPIError on 401 without retrying", async () => {
    mockFetch.mockResolvedValue(new Response("Unauthorized", { status: 401 }));

    try {
      await hooxFetch("/test");
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(WorkerAPIError);
      expect((error as WorkerAPIError).status).toBe(401);
      expect((error as WorkerAPIError).retryable).toBe(false);
    }
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("throws WorkerAPIError on 429 without retrying", async () => {
    mockFetch.mockResolvedValue(
      new Response("Too Many Requests", { status: 429 })
    );

    try {
      await hooxFetch("/test");
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(WorkerAPIError);
      expect((error as WorkerAPIError).status).toBe(429);
      expect((error as WorkerAPIError).retryable).toBe(false);
    }
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries on 500 server error", async () => {
    const mockResponse = { data: "success" };

    // Fail first time, succeed second time
    mockFetch
      .mockResolvedValueOnce(new Response("Server Error", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    // Mock sleep to avoid waiting in tests
    const originalSetTimeout = global.setTimeout;

    (global as any).setTimeout = (cb: () => void) => cb();

    const result = await hooxFetch("/test");
    expect(result).toEqual(mockResponse);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    global.setTimeout = originalSetTimeout;
  });

  it("retries on network error", async () => {
    const mockResponse = { data: "success" };

    // Fail first time with network error, succeed second time
    mockFetch
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    // Mock sleep to avoid waiting in tests
    const originalSetTimeout = global.setTimeout;

    (global as any).setTimeout = (cb: () => void) => cb();

    const result = await hooxFetch("/test");
    expect(result).toEqual(mockResponse);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    global.setTimeout = originalSetTimeout;
  });
});
