import { describe, expect, test, beforeEach, jest } from "@jest/globals";
import webhookReceiver from "../src/index.js";
import type { Fetcher } from "@cloudflare/workers-types";

describe("Webhook Receiver", () => {
  const TEST_API_KEY = "test-api-key-from-store";
  const TEST_INTERNAL_KEY = "test-internal-key-from-store";

  // Mock environment setup function - Updated for Service Bindings
  const createMockEnv = (secrets) => ({
    WEBHOOK_API_KEY_BINDING: {
      get: jest.fn().mockResolvedValue(secrets.apiKey),
    },
    INTERNAL_KEY_BINDING: {
      get: jest.fn().mockResolvedValue(secrets.internalKey),
    },
    // Mock Service Bindings
    TRADE_SERVICE: {
      // Mock the fetch method expected by the service binding
      fetch: jest.fn().mockImplementation((request: Request) => {
        // Forward the call to the global fetch mock to simulate the actual call
        // This allows centralized control over fetch behavior in tests
        return global.fetch(request);
      }),
    } as jest.Mocked<Fetcher>, // Cast to mocked Fetcher
    TELEGRAM_SERVICE: {
      fetch: jest.fn().mockImplementation((request: Request) => {
        return global.fetch(request);
      }),
    } as jest.Mocked<Fetcher>,
    // Remove unused URL and direct key variables
    // TRADE_WORKER_URL: "https://trade-worker.workers.dev", // Removed
    // TELEGRAM_WORKER_URL: "https://telegram-worker.workers.dev", // Removed
    // API_SECRET_KEY: secrets.apiKey, // Removed
    // INTERNAL_SERVICE_KEY: secrets.internalKey, // Removed
  });

  let mockEnv: ReturnType<typeof createMockEnv>;
  let fetchMock: jest.Mock; // Keep global fetch mock for underlying simulation

  const validWebhookPayload = {
    apiKey: TEST_API_KEY, // Use the key expected from the binding
    exchange: "mexc",
    action: "LONG",
    symbol: "BTC_USDT",
    quantity: 0.1,
    price: 50000,
    leverage: 20,
    notify: {
      message: "⚠️ BTC Hoox Signal: LONG at 50000",
      chatId: 123456789,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Setup default valid env
    mockEnv = createMockEnv({
      apiKey: TEST_API_KEY,
      internalKey: TEST_INTERNAL_KEY,
    });

    // Reset and setup the global fetch mock for downstream calls
    fetchMock = jest.fn();
    global.fetch = fetchMock;

    // Default successful fetch behavior (can be overridden per test)
    fetchMock.mockImplementation(async (request: Request | URL | string) => {
        const url = typeof request === 'string' ? request : request.url;
        console.log(`Global Mock Fetch Called: ${url}`);
        // Default success response
        return new Response(JSON.stringify({ success: true, result: { mockedSuccess: true } }), {
            status: 200, headers: { 'Content-Type': 'application/json' }
        });
    });

    // Link the service binding mocks to the global fetch mock
    mockEnv.TRADE_SERVICE.fetch.mockImplementation((req) => global.fetch(req));
    mockEnv.TELEGRAM_SERVICE.fetch.mockImplementation((req) => global.fetch(req));
  });

  test("rejects request with invalid apiKey from payload", async () => {
    const request = new Request("https://webhook-receiver.workers.dev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...validWebhookPayload,
        apiKey: "invalid-key-in-payload",
      }),
    });

    const response = await webhookReceiver.fetch(request, mockEnv);
    expect(response.status).toBe(403);
    // Add binding check back
    expect(mockEnv.WEBHOOK_API_KEY_BINDING.get).toHaveBeenCalledTimes(1); 
    expect(fetchMock).not.toHaveBeenCalled(); 
  });

  test("rejects request if apiKey binding is not configured", async () => {
    mockEnv = createMockEnv({ apiKey: null, internalKey: TEST_INTERNAL_KEY }); // API_SECRET_KEY is null
    const request = new Request("https://webhook-receiver.workers.dev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validWebhookPayload), // Payload has a key, but binding fails
    });

    const response = await webhookReceiver.fetch(request, mockEnv);
    // The validateApiKey function now logs an error and returns false, leading to 403
    expect(response.status).toBe(403);
    // Add binding check back
    expect(mockEnv.WEBHOOK_API_KEY_BINDING.get).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("processes valid webhook and forwards to both services", async () => {
    const request = new Request("https://webhook-receiver.workers.dev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validWebhookPayload),
    });

    const response = await webhookReceiver.fetch(request, mockEnv);
    expect(response.status).toBe(200);

    // Check bindings were called
    expect(mockEnv.WEBHOOK_API_KEY_BINDING.get).toHaveBeenCalledTimes(1);
    expect(mockEnv.INTERNAL_KEY_BINDING.get).toHaveBeenCalledTimes(2); 

    // Check service bindings' fetch methods were called
    expect(mockEnv.TRADE_SERVICE.fetch).toHaveBeenCalledTimes(1);
    expect(mockEnv.TELEGRAM_SERVICE.fetch).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Check call to trade worker (via service binding)
    const tradeCall = mockEnv.TRADE_SERVICE.fetch.mock.calls[0][0] as Request;
    expect(tradeCall).toBeDefined();
    expect(tradeCall.headers.get("X-Internal-Key")).toBe(TEST_INTERNAL_KEY);
    const tradeBody = await tradeCall.json();
    expect(tradeBody.exchange).toBe("mexc");
    expect(tradeBody.apiKey).toBeUndefined(); // Ensure apiKey was removed

    // Check call to notify worker (via service binding)
    const notifyCall = mockEnv.TELEGRAM_SERVICE.fetch.mock.calls[0][0] as Request;
    expect(notifyCall).toBeDefined();
    expect(notifyCall.headers.get("X-Internal-Key")).toBe(TEST_INTERNAL_KEY);
    const notifyBody = await notifyCall.json();
    expect(notifyBody.message).toBe(validWebhookPayload.notify.message);
    expect(notifyBody.apiKey).toBeUndefined(); // Ensure apiKey was removed

    const responseData = await response.json();
    expect(responseData.success).toBe(true);
    expect(responseData.requestId).toBeDefined();
    expect(responseData.tradeResult?.success).toBe(true);
    expect(responseData.notificationResult?.success).toBe(true);
  });

  test("returns internal error if internal key binding fails during forwarding", async () => {
    mockEnv = createMockEnv({ apiKey: TEST_API_KEY, internalKey: null }); // INTERNAL_SERVICE_KEY is null
    const request = new Request("https://webhook-receiver.workers.dev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validWebhookPayload),
    });

    const response = await webhookReceiver.fetch(request, mockEnv);
    expect(response.status).toBe(500);
    const body = await response.json();
    // Check the combined error message structure
    expect(body.error).toBe("Processing failed: Internal key binding not available or configured.; Internal key binding not available or configured.");
    // Remove the checks for individual parts as they are less precise
    // expect(body.error).toContain("Internal key binding not available");
    // expect(body.error).toContain("Trade processing failed");
    // expect(body.error).toContain("Notification processing failed");

    expect(mockEnv.WEBHOOK_API_KEY_BINDING.get).toHaveBeenCalledTimes(1);
    // INTERNAL_KEY_BINDING.get is attempted once for trade, fails, then attempted again for notify, fails.
    expect(mockEnv.INTERNAL_KEY_BINDING.get).toHaveBeenCalledTimes(2);
    // Service bindings are not called because internal key fetch failed first
    expect(mockEnv.TRADE_SERVICE.fetch).not.toHaveBeenCalled();
    expect(mockEnv.TELEGRAM_SERVICE.fetch).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // --- Additions --- 

  test("processes only trade signal when notify is missing", async () => {
    const tradeOnlyPayload = { ...validWebhookPayload };
    delete tradeOnlyPayload.notify; // Remove notify section

    const request = new Request("https://webhook-receiver.workers.dev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tradeOnlyPayload),
    });

    const response = await webhookReceiver.fetch(request, mockEnv);
    expect(response.status).toBe(200);

    expect(mockEnv.WEBHOOK_API_KEY_BINDING.get).toHaveBeenCalledTimes(1);
    expect(mockEnv.INTERNAL_KEY_BINDING.get).toHaveBeenCalledTimes(1); // Only called for trade
    expect(mockEnv.TRADE_SERVICE.fetch).toHaveBeenCalledTimes(1);
    expect(mockEnv.TELEGRAM_SERVICE.fetch).not.toHaveBeenCalled(); // Not called
    expect(fetchMock).toHaveBeenCalledTimes(1); // Only called for trade

    // Check call to trade worker (via service binding)
    const tradeCall = mockEnv.TRADE_SERVICE.fetch.mock.calls[0][0] as Request;
    expect(tradeCall).toBeDefined();
    expect(tradeCall.headers.get("X-Internal-Key")).toBe(TEST_INTERNAL_KEY);

    const responseData = await response.json();
    expect(responseData.success).toBe(true);
    expect(responseData.tradeResult?.success).toBe(true);
    expect(responseData.notificationResult).toBeNull(); // No notification result
  });

  test("processes only notify signal when trade details are missing", async () => {
    const notifyOnlyPayload = { 
      apiKey: TEST_API_KEY, 
      notify: validWebhookPayload.notify // Only apiKey and notify
    };
     // Define required fields even if empty/default for structure
    const completeNotifyOnlyPayload = {
        ...notifyOnlyPayload,
        exchange: "", action: "", symbol: "", quantity: 0 // Add empty trade fields
    };


    const request = new Request("https://webhook-receiver.workers.dev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Send payload that includes empty trade fields so base validation passes
      body: JSON.stringify(completeNotifyOnlyPayload),
    });

    const response = await webhookReceiver.fetch(request, mockEnv);
     // The worker logic doesn't forward trade if fields are empty/invalid
    expect(response.status).toBe(200);

    expect(mockEnv.WEBHOOK_API_KEY_BINDING.get).toHaveBeenCalledTimes(1);
    expect(mockEnv.INTERNAL_KEY_BINDING.get).toHaveBeenCalledTimes(1); // Only called for notify
    expect(mockEnv.TRADE_SERVICE.fetch).not.toHaveBeenCalled(); // Not called
    expect(mockEnv.TELEGRAM_SERVICE.fetch).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1); // Underlying global fetch

    // Check call to notify worker (via service binding)
    const notifyCall = mockEnv.TELEGRAM_SERVICE.fetch.mock.calls[0][0] as Request;
    expect(notifyCall).toBeDefined();
    expect(notifyCall.headers.get("X-Internal-Key")).toBe(TEST_INTERNAL_KEY);
    const notifyBody = await notifyCall.json();
    expect(notifyBody.message).toBe(validWebhookPayload.notify.message);


    const responseData = await response.json();
    expect(responseData.success).toBe(true);
    expect(responseData.tradeResult).toBeNull(); // No trade result
    expect(responseData.notificationResult?.success).toBe(true);
  });

  test("handles fetch error when forwarding to trade service", async () => {
    // Setup fetchMock to reject only for the trade service call
    fetchMock.mockImplementation(async (request: Request | URL | string) => {
        const url = typeof request === 'string' ? request : request.url;
        const body = request instanceof Request ? await request.clone().text() : '';
        console.log(`Global Mock Fetch Called: ${url} with body: ${body}`);

        // Simulate error for TRADE_SERVICE fetch
        // We need to inspect the request to know which service is being called,
        // since service bindings don't use distinct URLs in the mock.
        // Let's check the body content (assuming trade has 'exchange', notify has 'message')
        if (body.includes('"exchange":')) {
            console.log("Simulating Trade Service Fetch Error");
            throw new Error("Simulated Trade Worker Fetch Error");
        }
        // Handle telegram worker call successfully
        if (body.includes('"message":')) {
            console.log("Simulating Telegram Service Success");
            return new Response(JSON.stringify({ success: true, result: { forwarded: true } }), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
        }
        // Default fallback (shouldn't be hit in this test ideally)
        console.warn(`Global Mock Fetch: Unhandled request to ${url}`);
        return new Response("Mock Fetch: Not Found", { status: 404 });
    });

    // Re-link fetch mocks to use the new implementation
    mockEnv.TRADE_SERVICE.fetch.mockImplementation((req) => global.fetch(req));
    mockEnv.TELEGRAM_SERVICE.fetch.mockImplementation((req) => global.fetch(req));


    const request = new Request("https://webhook-receiver.workers.dev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validWebhookPayload),
    });

    const response = await webhookReceiver.fetch(request, mockEnv);
    expect(response.status).toBe(500); // Expect 500 due to downstream failure

    expect(mockEnv.WEBHOOK_API_KEY_BINDING.get).toHaveBeenCalledTimes(1);
    expect(mockEnv.INTERNAL_KEY_BINDING.get).toHaveBeenCalledTimes(2); // Called for both attempts
    expect(mockEnv.TRADE_SERVICE.fetch).toHaveBeenCalledTimes(1);
    expect(mockEnv.TELEGRAM_SERVICE.fetch).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2); // Called for both attempts

    const responseData = await response.json();
    expect(responseData.success).toBe(false);
    expect(responseData.error).toContain("Simulated Trade Worker Fetch Error");
    expect(responseData.tradeResult?.success).toBe(false); // Trade failed
    expect(responseData.notificationResult?.success).toBe(true); // Notify should still succeed
  });

});
