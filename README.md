# Hoox Worker

**Last Updated:** April 2026

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![Runtime](https://img.shields.io/badge/Runtime-Bun-black?logo=bun)](https://bun.sh) [![Platform](https://img.shields.io/badge/Platform-Cloudflare®%20Edge%20Workers-orange?logo=cloudflare)](https://workers.cloudflare.com/) [![License](https://img.shields.io/badge/License-CC%20BY%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by/4.0/) [![Build Status](https://github.com/jango-blockchained/hoox-setup/actions/workflows/opencode.yml/badge.svg)](https://github.com/jango-blockchained/hoox-setup/actions/workflows/opencode.yml)

**[Main Repository](https://github.com/jango-blockchained/hoox-setup)**

A Cloudflare® Worker service that acts as the **primary gateway** for external requests (e.g., TradingView alerts, UI actions). This worker validates incoming requests, optionally performs security checks (like IP allow-listing), and forwards them to the appropriate internal worker services using Cloudflare® Service Bindings.

## Features

- Acts as a single entry point for various external triggers.
- Validates external API keys (`apiKey` field).
- Optional IP address allow-listing (checks `CF-Connecting-IP` header, configurable via KV).
- Determines the target internal worker based on the request payload's `target` field.
- Forwards requests to internal workers using **Service Bindings** (defined in `wrangler.jsonc`).
- Returns responses from internal workers, wrapped with gateway context.
- **Queue Producer**: Sends trades to `trade-execution` queue for async processing.
- **Queue Modes**: `queue_failover` (default) or `queue_everywhere` (configurable via KV).
- **Idempotency**:Prevents duplicate trades using Durable Objects.
- **Rate Limiting**: In-memory rate limiting (10 trades/minute).

## Setup

1.  Install dependencies:
    ```bash
    bun install
    ```
2.  Set your Cloudflare® account ID in `wrangler.jsonc`.
3.  Configure Secrets (via Cloudflare® dashboard or `wrangler secret put`):
    - `WEBHOOK_API_KEY_BINDING`: The secret key expected in the `apiKey` field of incoming external requests.
    - `INTERNAL_KEY_BINDING`: A shared secret key used for authentication _between_ this worker and the target workers it calls via service bindings. The target workers must also have this secret configured.
4.  Configure KV Namespaces (if using configurable features like IP allow-listing):
    ```bash
    npx wrangler kv:namespace create CONFIG_KV
    ```
5.  Update `wrangler.jsonc` with necessary bindings (Secrets, KV, Service Bindings). Example:
    `jsonc
    {
      "name": "hoox",
      "main": "src/index.ts",
      "compatibility_date": "2025-03-07",
      "compatibility_flags": ["nodejs_compat"],
      "account_id": "YOUR_CLOUDFLARE_ACCOUNT_ID",
      "secrets": [
        "WEBHOOK_API_KEY_BINDING",
        "INTERNAL_KEY_BINDING"
      ],
      "kv_namespaces": [
        // Example: If using KV for config
        { "binding": "CONFIG_KV", "id": "<CONFIG_KV_ID>", "preview_id": "<CONFIG_KV_PREVIEW_ID>" }
      ],
      "services": [
        // Bindings to the workers this receiver calls
        { "binding": "TRADE_SERVICE", "service": "trade-worker" }, // 'trade-worker' must be the name defined in its own wrangler.jsonc
        { "binding": "TELEGRAM_SERVICE", "service": "telegram-worker" },

        // Add other target service bindings as needed
      ],
"observability": {
         "enabled": true,
         "head_sampling_rate": 1
       },
       "queues": {
         "producers": [
           { "queue": "trade-execution", "binding": "TRADE_QUEUE" }
         ]
       },
       "durable_objects": {
         "bindings": [
           { "name": "IDEMPOTENCY_STORE", "class_name": "IdempotencyStore" }
         ],
         "migrations": [
           { "tag": "v1", "new_sqlite_classes": ["IdempotencyStore"] }
         ]
       }
     }
     `
6.  Update the corresponding `worker-configuration.d.ts` file.
7.  For local development, create a `.dev.vars` file and define the secrets/variables:
    ```.dev.vars
    # Mock secret bindings for local dev:
    WEBHOOK_API_KEY_BINDING="your_external_api_key"
    INTERNAL_KEY="your_shared_internal_secret"
    # For local testing of service bindings, wrangler dev needs to run all services
    # simultaneously or you need alternative mocking strategies.
    # See: https://developers.cloudflare.com/workers/platform/bindings/service-bindings/local-development/
    ```

## Development

Run locally:

```bash
# Running locally requires careful handling of service bindings.
# Option 1: Run all dependent workers simultaneously using a tool like 'concurrently'.
# Option 2: Mock service bindings in your local code.
bun run dev
```

Deploy:

```bash
bun run deploy
```

## API Interface

### Incoming Request (External -> Webhook Receiver)

- **Method:** `POST`
- **Endpoint:** `/`

---

_Cloudflare® and the Cloudflare logo are trademarks and/or registered trademarks of Cloudflare, Inc. in the United States and other jurisdictions._
