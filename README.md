# @hoox/hoox

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![Runtime](https://img.shields.io/badge/Runtime-Bun-black?logo=bun)](https://bun.sh) [![Platform](https://img.shields.io/badge/Platform-Cloudflare%C2%AE%20Workers-orange?logo=cloudflare)](https://workers.cloudflare.com/) [![License](https://img.shields.io/badge/License-CC%20BY%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by/4.0/)

Gateway — validates incoming webhooks, routes trade signals to execution workers, prevents duplicate trades.

## For CLI Users

Use this worker indirectly when you run `hoox` commands:

- `hoox deploy worker hoox` — deploy the gateway worker
- `hoox monitor status` — check gateway health and recent activity

→ [Deploy Guide](../../docs/guides/deploy-workers.md) · [CLI Reference](../../docs/reference/cli-commands.md)

## For Operators

This worker provides the primary entry point for all external trading signals. It validates API keys, checks IP allow-lists, enforces rate limits, and routes validated payloads to the appropriate internal worker via Service Bindings. Idempotency protection (Durable Objects) prevents duplicate trade execution.

→ [Operator Docs](../../docs/devops/workers/hoox.md)

## Development

```bash
bun test workers/hoox
```
