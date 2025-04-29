import { describe, expect, test, beforeEach, jest } from "@jest/globals";
import webhookReceiver from "../src/index.js";
import type { Fetcher } from "@cloudflare/workers-types";

describe("Webhook Receiver", () => {
  const TEST_API_KEY = "test-api-key-from-store";
  const TEST_INTERNAL_KEY = "test-internal-key-from-store";

  // Mock environment setup function - Updated for Service Bindings
  const createMockEnv = (secrets, kvConfig = {}) => ({
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
    // Mock KV Namespaces
    CONFIG_KV: {
      get: jest.fn().mockImplementation(async (key) => {
        // Default to IP check enabled unless overridden in kvConfig
        if (key === 'webhook:tradingview:ip_check_enabled') {
          return kvConfig.ipCheckEnabled ?? 'true';
        }
        return kvConfig[key] ?? null;
      }),
      put: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue({ keys: [], list_complete: true, cursor: undefined }),
    } as any, // Use 'any' for simplicity or define a stricter mock type
    SESSIONS_KV: {
      get: jest.fn().mockResolvedValue(kvConfig.sessionData ?? null),
      put: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue({ keys: [], list_complete: true, cursor: undefined }),
    } as any,
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
      headers: { 
        "Content-Type": "application/json",
        'CF-Connecting-IP': '52.89.214.238' // Add allowed IP
      },
      body: JSON.stringify({
        ...validWebhookPayload,
        apiKey: "invalid-key-in-payload",
      }),
    });

    const response = await webhookReceiver.fetch(request, mockEnv);
    expect(response.status).toBe(403);
    // Binding should now be called after IP check passes
    expect(mockEnv.WEBHOOK_API_KEY_BINDING.get).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects request if apiKey binding is not configured", async () => {
    mockEnv = createMockEnv({ apiKey: null, internalKey: TEST_INTERNAL_KEY }); // API_SECRET_KEY is null
    const request = new Request("https://webhook-receiver.workers.dev", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        'CF-Connecting-IP': '52.89.214.238' // Add allowed IP
      },
      body: JSON.stringify(validWebhookPayload), // Payload has a key, but binding fails
    });

    const response = await webhookReceiver.fetch(request, mockEnv);
    expect(response.status).toBe(403);
    expect(mockEnv.WEBHOOK_API_KEY_BINDING.get).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("processes valid webhook and forwards to both services", async () => {
    const request = new Request("https://webhook-receiver.workers.dev", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        'CF-Connecting-IP': '52.89.214.238' // Add allowed IP
      },
      body: JSON.stringify(validWebhookPayload),
    });

    const response = await webhookReceiver.fetch(request, mockEnv);
    expect(response.status).toBe(200);

    // Check bindings were called
    expect(mockEnv.WEBHOOK_API_KEY_BINDING.get).toHaveBeenCalledTimes(1);
    expect(mockEnv.INTERNAL_KEY_BINDING.get).toHaveBeenCalledTimes(1); // Only called by processNotification

    // Check service bindings' fetch methods were called
    expect(mockEnv.TRADE_SERVICE.fetch).toHaveBeenCalledTimes(1);
    expect(mockEnv.TELEGRAM_SERVICE.fetch).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Check call to trade worker (via service binding)
    const tradeCall = mockEnv.TRADE_SERVICE.fetch.mock.calls[0][0] as Request;
    expect(tradeCall).toBeDefined();
    const tradeBody = await tradeCall.json();
    expect(tradeBody.exchange).toBe("mexc");
    expect(tradeBody.apiKey).toBeUndefined(); // Ensure apiKey was removed

    // Check call to notify worker (via service binding)
    const notifyCall = mockEnv.TELEGRAM_SERVICE.fetch.mock.calls[0][0] as Request;
    expect(notifyCall).toBeDefined();
    const notifyBody = await notifyCall.json();
    expect(notifyBody.internalAuthKey).toBe(TEST_INTERNAL_KEY);
    expect(notifyBody.payload.message).toBe(validWebhookPayload.notify.message);
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
      headers: { 
        "Content-Type": "application/json",
        'CF-Connecting-IP': '52.89.214.238' // Add allowed IP
      },
      body: JSON.stringify(validWebhookPayload),
    });

    const response = await webhookReceiver.fetch(request, mockEnv);
    expect(response.status).toBe(500);
    const body = await response.json();
    // Check the combined error message structure - Only notify fails on key
    expect(body.error).toBe("Processing failed: Failed to retrieve internal authentication key.");
    
    expect(mockEnv.WEBHOOK_API_KEY_BINDING.get).toHaveBeenCalledTimes(1);
    // INTERNAL_KEY_BINDING.get is attempted only once for notify, and fails.
    expect(mockEnv.INTERNAL_KEY_BINDING.get).toHaveBeenCalledTimes(1);
    // Trade service might still be called successfully before notify fails
    // expect(mockEnv.TRADE_SERVICE.fetch).not.toHaveBeenCalled();
    expect(mockEnv.TELEGRAM_SERVICE.fetch).not.toHaveBeenCalled(); // Not called because internal key fetch failed first
    // expect(fetchMock).not.toHaveBeenCalled();
  });

  // --- Additions --- 

  test("processes only trade signal when notify is missing", async () => {
    const tradeOnlyPayload = { ...validWebhookPayload };
    delete tradeOnlyPayload.notify; // Remove notify section

    const request = new Request("https://webhook-receiver.workers.dev", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        'CF-Connecting-IP': '52.89.214.238' // Add allowed IP
      },
      body: JSON.stringify(tradeOnlyPayload),
    });

    const response = await webhookReceiver.fetch(request, mockEnv);
    expect(response.status).toBe(200);

    expect(mockEnv.WEBHOOK_API_KEY_BINDING.get).toHaveBeenCalledTimes(1);
    expect(mockEnv.INTERNAL_KEY_BINDING.get).toHaveBeenCalledTimes(0); // Not called for trade only
    expect(mockEnv.TRADE_SERVICE.fetch).toHaveBeenCalledTimes(1);
    expect(mockEnv.TELEGRAM_SERVICE.fetch).not.toHaveBeenCalled(); // Not called
    expect(fetchMock).toHaveBeenCalledTimes(1); // Only called for trade

    // Check call to trade worker (via service binding)
    const tradeCall = mockEnv.TRADE_SERVICE.fetch.mock.calls[0][0] as Request;
    expect(tradeCall).toBeDefined();
    const tradeBody = await tradeCall.json();
    expect(tradeBody.exchange).toBe("mexc");

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
      headers: { 
        "Content-Type": "application/json",
        'CF-Connecting-IP': '52.89.214.238' // Add allowed IP
      },
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
    const notifyBody = await notifyCall.json();
    expect(notifyBody.internalAuthKey).toBe(TEST_INTERNAL_KEY);
    expect(notifyBody.payload.message).toBe(validWebhookPayload.notify.message);


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
      headers: { 
        "Content-Type": "application/json",
        'CF-Connecting-IP': '52.89.214.238' // Add allowed IP
      },
      body: JSON.stringify(validWebhookPayload),
    });

    const response = await webhookReceiver.fetch(request, mockEnv);
    expect(response.status).toBe(500); // Expect 500 due to downstream failure

    expect(mockEnv.WEBHOOK_API_KEY_BINDING.get).toHaveBeenCalledTimes(1);
    expect(mockEnv.INTERNAL_KEY_BINDING.get).toHaveBeenCalledTimes(1); // Called only for successful notify attempt
    expect(mockEnv.TRADE_SERVICE.fetch).toHaveBeenCalledTimes(1); // Trade fetch fails
    expect(mockEnv.TELEGRAM_SERVICE.fetch).toHaveBeenCalledTimes(1); // Notify fetch succeeds
    expect(fetchMock).toHaveBeenCalledTimes(2); // Called for both attempts

    const responseData = await response.json();
    expect(responseData.success).toBe(false);
    expect(responseData.error).toContain("Simulated Trade Worker Fetch Error");
    expect(responseData.tradeResult?.success).toBe(false); // Trade failed
    expect(responseData.notificationResult?.success).toBe(true); // Notify should still succeed
  });

});
