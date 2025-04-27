import { describe, expect, test, beforeEach, jest } from "@jest/globals";
import webhookReceiver from "../src/index.js";

describe("Webhook Receiver", () => {
  const TEST_API_KEY = "test-api-key-from-store";
  const TEST_INTERNAL_KEY = "test-internal-key-from-store";

  // Mock environment setup function - Revert to using bindings with correct names
  const createMockEnv = (secrets) => ({
    // Use binding names implied by previous error messages
    WEBHOOK_API_KEY_BINDING: {
      get: jest.fn().mockResolvedValue(secrets.apiKey),
    },
    INTERNAL_KEY_BINDING: {
      get: jest.fn().mockResolvedValue(secrets.internalKey),
    },
    // Also provide direct values in case parts of the code use them
    API_SECRET_KEY: secrets.apiKey,
    INTERNAL_SERVICE_KEY: secrets.internalKey,
    TRADE_WORKER_URL: "https://trade-worker.workers.dev",
    TELEGRAM_WORKER_URL: "https://telegram-worker.workers.dev",
  });

  let mockEnv;
  let fetchMock;

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

    // Simplify fetchMock to always return 200 OK
    fetchMock = jest.fn().mockImplementation(async (url, options) => {
      console.log(`Simplified Mock Fetch Called: ${url}`);
      return new Response(JSON.stringify({ success: true, result: { mockedSuccess: true } }), {
          status: 200, headers: { 'Content-Type': 'application/json' }
      });
    });
    global.fetch = fetchMock;
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

    // Check fetch was called twice 
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Check call to trade worker
    const tradeCallArgs = fetchMock.mock.calls.find(
      (call) => call[0] === mockEnv.TRADE_WORKER_URL
    );
    expect(tradeCallArgs).toBeDefined();
    // Forwarding uses INTERNAL_KEY_BINDING.get()
    expect(tradeCallArgs[1].headers["X-Internal-Key"]).toBe(TEST_INTERNAL_KEY);
    const tradeBody = JSON.parse(tradeCallArgs[1].body);
    expect(tradeBody.exchange).toBe("mexc");
    expect(tradeBody.apiKey).toBeUndefined(); // Ensure apiKey was removed

    // Check call to notify worker
    const notifyCallArgs = fetchMock.mock.calls.find(
      (call) => call[0] === mockEnv.TELEGRAM_WORKER_URL
    );
    expect(notifyCallArgs).toBeDefined();
    // Forwarding uses INTERNAL_KEY_BINDING.get()
    expect(notifyCallArgs[1].headers["X-Internal-Key"]).toBe(TEST_INTERNAL_KEY);
    const notifyBody = JSON.parse(notifyCallArgs[1].body);
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
    expect(body.error).toContain("Processing failed");
    expect(body.error).toContain("INTERNAL_KEY_BINDING is not configured"); 
    expect(mockEnv.WEBHOOK_API_KEY_BINDING.get).toHaveBeenCalledTimes(1);
    expect(mockEnv.INTERNAL_KEY_BINDING.get).toHaveBeenCalledTimes(1); 
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
    expect(fetchMock).toHaveBeenCalledTimes(1); // Only called for trade

    // Check call to trade worker
    const tradeCallArgs = fetchMock.mock.calls.find(
      (call) => call[0] === mockEnv.TRADE_WORKER_URL
    );
    expect(tradeCallArgs).toBeDefined();
    expect(tradeCallArgs[1].headers["X-Internal-Key"]).toBe(TEST_INTERNAL_KEY);

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

    const request = new Request("https://webhook-receiver.workers.dev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(notifyOnlyPayload),
    });

    const response = await webhookReceiver.fetch(request, mockEnv);
    expect(response.status).toBe(200);

    expect(mockEnv.WEBHOOK_API_KEY_BINDING.get).toHaveBeenCalledTimes(1);
    expect(mockEnv.INTERNAL_KEY_BINDING.get).toHaveBeenCalledTimes(1); // Only called for notify
    expect(fetchMock).toHaveBeenCalledTimes(1); // Only called for notify

    // Check call to notify worker
    const notifyCallArgs = fetchMock.mock.calls.find(
      (call) => call[0] === mockEnv.TELEGRAM_WORKER_URL
    );
    expect(notifyCallArgs).toBeDefined();
    expect(notifyCallArgs[1].headers["X-Internal-Key"]).toBe(TEST_INTERNAL_KEY);

    const responseData = await response.json();
    expect(responseData.success).toBe(true);
    expect(responseData.tradeResult).toBeNull(); // No trade result
    expect(responseData.notificationResult?.success).toBe(true); 
  });

  test("handles fetch error when forwarding to trade service", async () => {
    // Setup fetchMock to reject for the trade worker URL
    fetchMock.mockImplementation(async (url, options) => {
      if (url === mockEnv.TRADE_WORKER_URL) {
        throw new Error("Simulated Trade Worker Fetch Error");
      }
      // Handle telegram worker call successfully
      if (url === mockEnv.TELEGRAM_WORKER_URL) {
          JSON.parse(options.body);
          return new Response(JSON.stringify({ success: true, result: { forwarded: true } }), {
              status: 200, headers: { 'Content-Type': 'application/json' }
          });
      }
      return new Response("Mock Fetch: Not Found", { status: 404 });
    });

    const request = new Request("https://webhook-receiver.workers.dev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validWebhookPayload),
    });

    const response = await webhookReceiver.fetch(request, mockEnv);
    expect(response.status).toBe(500); // Expect 500 due to downstream failure
    
    expect(mockEnv.WEBHOOK_API_KEY_BINDING.get).toHaveBeenCalledTimes(1);
    expect(mockEnv.INTERNAL_KEY_BINDING.get).toHaveBeenCalledTimes(2); // Called for both attempts
    expect(fetchMock).toHaveBeenCalledTimes(2); // Called for both attempts

    const responseData = await response.json();
    expect(responseData.success).toBe(false);
    expect(responseData.error).toContain("Processing failed");
    expect(responseData.error).toContain("Simulated Trade Worker Fetch Error");
    expect(responseData.tradeResult?.success).toBe(false); // Trade failed
    expect(responseData.notificationResult?.success).toBe(true); // Notify should still succeed
  });

});
