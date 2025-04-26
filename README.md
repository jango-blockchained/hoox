# Webhook Receiver Worker

A Cloudflare Worker service that acts as the **primary gateway** for external requests (e.g., TradingView alerts, UI actions). This worker validates incoming requests and forwards them to the appropriate internal worker services using a standardized protocol.

## Features

- Acts as a single entry point for various external triggers.
- Validates external API keys.
- Determines the target internal worker based on the request payload.
- Forwards requests to internal workers using a standardized format and secure internal authentication.
- Returns responses from internal workers, wrapped with gateway context.

## Prerequisites

- Node.js >= 16
- Bun (or npm/yarn)
- Wrangler CLI
- Cloudflare Workers account

## Setup

1.  Install dependencies:
    ```bash
    bun install
    ```
2.  Set your Cloudflare account ID in `wrangler.toml`.
3.  Configure worker URLs in `wrangler.toml` (`vars` section):
    - `TRADE_WORKER_URL`: URL of the deployed trade-worker.
    - `TELEGRAM_WORKER_URL`: URL of the deployed telegram-worker.
    - `HA_WORKER_URL`: URL of the deployed home-assistant-worker.
    - _(Add URLs for any other target workers)_
4.  Configure Secrets (via Cloudflare dashboard Secrets Store or `wrangler secret put`):
    - `WEBHOOK_API_SECRET_KEY`: The secret key expected in the `apiKey` field of incoming external requests. Bind this to `WEBHOOK_API_KEY_BINDING` in `wrangler.toml`.
    - `WEBHOOK_INTERNAL_KEY`: A shared secret key used for authentication _between_ this worker and the target workers. Bind this to `INTERNAL_KEY_BINDING` in `wrangler.toml`.
5.  For local development, create a `.dev.vars` file and define the URLs and secrets:
    ```.dev.vars
    TRADE_WORKER_URL="http://localhost:<trade_worker_port>"
    TELEGRAM_WORKER_URL="http://localhost:<telegram_worker_port>"
    HA_WORKER_URL="http://localhost:<ha_worker_port>"
    # Mock secret bindings for local dev:
    WEBHOOK_API_KEY_BINDING="your_external_api_key"
    INTERNAL_KEY_BINDING="your_shared_internal_secret"
    ```

## Development

Run locally (e.g., on port 8787):

```bash
bun run dev --port 8787
```

Deploy:

```bash
bun run deploy
```

## API Interface

### Incoming Request (External -> Webhook Receiver)

- **Method:** `POST`
- **Endpoint:** `/` (Worker root)
- **Content-Type:** `application/json`
- **Body Structure:**
  ```json
  {
    "apiKey": "YOUR_EXTERNAL_API_KEY", // Validated against WEBHOOK_API_KEY_BINDING
    "target": "TARGET_WORKER_NAME", // e.g., "trade", "telegram", "home-assistant"
    // --- Target-specific payload fields below ---
    "field1": "value1",
    "field2": "value2"
    // ... (rest of the payload for the target worker)
  }
  ```
  - `apiKey`: **Required**. Must match the `WEBHOOK_API_SECRET_KEY` secret.
  - `target`: **Required**. Specifies which internal worker should process the request. Must match a key in the `workerUrls` map in `src/index.js` (e.g., "trade", "telegram", "home-assistant").
  - Other fields: These are passed directly inside the `payload` object to the target worker.

### Outgoing Request (Webhook Receiver -> Target Worker)

- **Method:** `POST`
- **Endpoint:** `{TARGET_WORKER_URL}/process`
- **Content-Type:** `application/json`
- **Body Structure:**
  ```json
  {
    "requestId": "<generated_uuid>",
    "internalAuthKey": "YOUR_INTERNAL_SHARED_SECRET", // From INTERNAL_KEY_BINDING
    "payload": {
      // --- Contains all fields from the original request EXCEPT apiKey and target ---
      "field1": "value1",
      "field2": "value2"
      // ...
    }
  }
  ```

### Response Format (External <- Webhook Receiver)

The receiver echoes the response from the target worker, wrapped with gateway context.

**Success Example:**

```json
{
  "gatewaySuccess": true, // Indicates the forwarding call was successful (HTTP 2xx)
  "requestId": "<generated_uuid>",
  "worker": "webhook-receiver",
  "targetWorker": "trade",
  "targetResponse": {
    // The actual response from the target worker
    "success": true,
    "result": {
      /* Trade execution result */
    },
    "error": null
  }
}
```

**Forwarding Error Example (Target worker down):**

```json
{
  "gatewaySuccess": false,
  "requestId": "<generated_uuid>",
  "worker": "webhook-receiver",
  "targetWorker": "trade",
  "targetResponse": {
    "success": false,
    "error": "Failed to connect to target worker: ...",
    "result": null
  }
}
```

**Target Worker Error Example (Target worker rejected request):**

```json
{
  "gatewaySuccess": true, // Forwarding was ok (got a response)
  "requestId": "<generated_uuid>",
  "worker": "webhook-receiver",
  "targetWorker": "trade",
  "targetResponse": {
    // The actual response from the target worker
    "success": false,
    "result": null,
    "error": "Invalid quantity in payload"
  }
}
```

## Security

- External requests are authenticated via `apiKey`.
- Internal communication between the receiver and target workers is authenticated via a shared `internalAuthKey`.
- Target workers _must_ validate the `internalAuthKey` received in the request body.
