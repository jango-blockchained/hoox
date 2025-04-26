# Webhook Receiver

A Cloudflare Worker service that acts as the entry point for TradingView alerts and other trading signals. This worker validates incoming webhooks and forwards them to the appropriate worker services.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/yourusername/hoox-trading/tree/main/webhook-receiver)

## Features

- TradingView webhook integration
- Request validation and sanitization
- Secure communication with other workers
- Error handling and logging
- Rate limiting support
- Telegram notifications

## Prerequisites

- Node.js >= 16
- Bun (for package management)
- Wrangler CLI
- Cloudflare Workers account

## Setup

1. Install dependencies:

```bash
bun install
```

2. Set your Cloudflare account ID in `wrangler.toml`:

```toml
name = "webhook-receiver"
account_id = "your_account_id_here"
main = "src/index.js"
```

3. Configure environment variables in `.dev.vars` for local development:

```env
INTERNAL_SERVICE_KEY=your_internal_key
API_SECRET_KEY=your_api_secret_key
TRADE_WORKER_URL=http://localhost:8788
TELEGRAM_WORKER_URL=http://localhost:8790
```

4. Configure production secrets:

```bash
wrangler secret put INTERNAL_SERVICE_KEY
wrangler secret put API_SECRET_KEY
```

5. Update the worker URLs in `wrangler.toml` for production:

```toml
[vars]
TRADE_WORKER_URL = "https://your-trade-worker.workers.dev"
TELEGRAM_WORKER_URL = "https://your-telegram-worker.workers.dev"
```

## Development

### Local Development

For local development, this worker should run on port 8789:

```bash
bun run dev -- --port 8789
```

The worker uses environment variables from `.dev.vars` during local development instead of the values in `wrangler.toml` or Cloudflare secrets.

### Production Deployment

Deploy to production:

```bash
bun run deploy
```

## Webhook Configuration

### TradingView Alert Message Format

```json
{
  "apiKey": "your_api_secret_key",
  "exchange": "binance",
  "action": "LONG",
  "symbol": "BTC_USDT",
  "quantity": 0.001,
  "price": 65000,
  "leverage": 20,
  "notify": {
    "message": "⚠️ BTC Hoox Signal: LONG at 65000",
    "chatId": 123456789
  }
}
```

### Supported Actions

- `LONG`: Open a long position
- `SHORT`: Open a short position
- `CLOSE_LONG`: Close a long position
- `CLOSE_SHORT`: Close a short position

## Worker Communication

The webhook receiver communicates with:

- Trade Worker: For executing trades
- Telegram Worker: For sending notifications

## Security

- Webhook authentication using `apiKey`
- Internal service authentication for worker communication
- Request validation and sanitization
- Error messages don't expose sensitive information

## Error Handling

The worker includes error handling for:

- Invalid webhook payloads
- Authentication failures
- Worker communication errors
- Network issues

## Response Format

Success:

```json
{
  "success": true,
  "message": "Trade request forwarded successfully",
  "tradeResponse": {
    // Trade response details
  },
  "notificationSent": true
}
```

Error:

```json
{
  "success": false,
  "error": "Error message"
}
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request
