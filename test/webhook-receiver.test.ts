import { describe, expect, test, beforeEach, jest } from "@jest/globals";
import webhookReceiver from "../src/index.js";

describe("Webhook Receiver", () => {
    const TEST_API_KEY = "test-api-key-from-store";
    const TEST_INTERNAL_KEY = "test-internal-key-from-store";

    // Mock environment setup function
    const createMockEnv = (secrets) => ({
        WEBHOOK_API_KEY_BINDING: { get: jest.fn().mockResolvedValue(secrets.apiKey) },
        INTERNAL_KEY_BINDING: { get: jest.fn().mockResolvedValue(secrets.internalKey) },
        // Keep plain vars
        TRADE_WORKER_URL: "https://trade-worker.workers.dev",
        TELEGRAM_WORKER_URL: "https://telegram-worker.workers.dev"
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
            chatId: 123456789
        }
    };

    beforeEach(() => {
        jest.clearAllMocks();
        // Setup default valid env
        mockEnv = createMockEnv({ apiKey: TEST_API_KEY, internalKey: TEST_INTERNAL_KEY });

        // Mock global fetch to create a NEW response each time it's called
        fetchMock = jest.fn().mockImplementation(() => 
            Promise.resolve(new Response( // Create new Response on each call
                JSON.stringify({ success: true, result: { /* mock service result */ } }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            ))
        );
        global.fetch = fetchMock;
    });

    test("rejects request with invalid apiKey from payload", async () => {
        const request = new Request("https://webhook-receiver.workers.dev", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ...validWebhookPayload,
                apiKey: "invalid-key-in-payload"
            })
        });

        const response = await webhookReceiver.fetch(request, mockEnv);
        expect(response.status).toBe(403);
        expect(mockEnv.WEBHOOK_API_KEY_BINDING.get).toHaveBeenCalledTimes(1);
        expect(fetchMock).not.toHaveBeenCalled(); // No forwarding should happen
    });

    test("rejects request if apiKey binding is not configured", async () => {
        mockEnv = createMockEnv({ apiKey: null, internalKey: TEST_INTERNAL_KEY }); // API Key binding returns null
        const request = new Request("https://webhook-receiver.workers.dev", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(validWebhookPayload) // Payload has a key, but binding fails
        });

        const response = await webhookReceiver.fetch(request, mockEnv);
        expect(response.status).toBe(403);
        expect(mockEnv.WEBHOOK_API_KEY_BINDING.get).toHaveBeenCalledTimes(1);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test("processes valid webhook and forwards to both services", async () => {
        const request = new Request("https://webhook-receiver.workers.dev", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(validWebhookPayload)
        });

        const response = await webhookReceiver.fetch(request, mockEnv);
        expect(response.status).toBe(200);

        // Check bindings were called
        expect(mockEnv.WEBHOOK_API_KEY_BINDING.get).toHaveBeenCalledTimes(1);
        expect(mockEnv.INTERNAL_KEY_BINDING.get).toHaveBeenCalledTimes(2); // Called once for trade, once for notify

        // Check fetch was called twice (for trade and notify workers)
        expect(fetchMock).toHaveBeenCalledTimes(2);

        // Check call to trade worker
        const tradeCallArgs = fetchMock.mock.calls.find(call => call[0] === mockEnv.TRADE_WORKER_URL);
        expect(tradeCallArgs).toBeDefined();
        expect(tradeCallArgs[1].headers['X-Internal-Key']).toBe(TEST_INTERNAL_KEY);
        const tradeBody = JSON.parse(tradeCallArgs[1].body);
        expect(tradeBody.exchange).toBe("mexc");
        expect(tradeBody.apiKey).toBeUndefined(); // Ensure apiKey was removed

         // Check call to notify worker
        const notifyCallArgs = fetchMock.mock.calls.find(call => call[0] === mockEnv.TELEGRAM_WORKER_URL);
        expect(notifyCallArgs).toBeDefined();
        expect(notifyCallArgs[1].headers['X-Internal-Key']).toBe(TEST_INTERNAL_KEY);
        const notifyBody = JSON.parse(notifyCallArgs[1].body);
        expect(notifyBody.message).toBe(validWebhookPayload.notify.message);
        expect(notifyBody.apiKey).toBeUndefined(); // Ensure apiKey was removed

        const responseData = await response.json();
        expect(responseData.success).toBe(true);
        expect(responseData.requestId).toBeDefined();
        expect(responseData.trade?.success).toBe(true);
        expect(responseData.notification?.success).toBe(true);
    });

    test("returns internal error if internal key binding fails during forwarding", async () => {
        mockEnv = createMockEnv({ apiKey: TEST_API_KEY, internalKey: null }); // Internal key binding returns null
        const request = new Request("https://webhook-receiver.workers.dev", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(validWebhookPayload)
        });

        const response = await webhookReceiver.fetch(request, mockEnv);
        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.error).toContain("Internal processing error");
        expect(mockEnv.WEBHOOK_API_KEY_BINDING.get).toHaveBeenCalledTimes(1);
        expect(mockEnv.INTERNAL_KEY_BINDING.get).toHaveBeenCalledTimes(1); // Called once before failing
        expect(fetchMock).not.toHaveBeenCalled(); // No forwarding attempted
    });

    // Add test for only trade signal (no notify)
    // Add test for only notify signal (no trade)
    // Add test for fetch errors during forwarding
}); 