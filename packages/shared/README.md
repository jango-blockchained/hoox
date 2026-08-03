# @hoox/shared

Shared types, custom router with path parameter support (`:param` syntax), middleware (auth, CORS, rate-limit, logger), error factories (`Errors.*`), generic exchange provider factory (`ExchangeRouter`, `IExchangeProvider`), and utilities.

## For CLI Users

This is an internal package — installed automatically as a workspace dependency. No CLI commands needed.

→ [Architecture Overview](../../docs/devops/architecture/overview.md)

## For Operators

This package provides the shared foundation for all Hoox workers. It includes:

- **Custom Router** — Lightweight routing with exact-match fast path and `:param` path parameter support. Handlers receive extracted params as an optional 4th argument.
- **Error Factories** — `Errors.*` helpers (`badRequest`, `unauthorized`, `forbidden`, `notFound`, `internal`, etc.) for consistent JSON error responses across all workers.
- **Exchange Provider Factory** — Generic `ExchangeRouter<TClient, TEnv>` and `IExchangeProvider<TClient, TEnv>` for registering and resolving exchange clients by name.
- **Middleware** — Logger (`createLogger`, `withRequestLog`), auth (`requireInternalAuth`), CORS, rate limiting, and Zod validation.
- **Utilities** — `toError`, `serviceFetch`, `createJsonResponse`, KV helpers, health check, analytics tracking.

→ [Architecture Overview](../../docs/devops/architecture/overview.md)

## Public API

This package is published as `@hoox-sh/hoox-shared` and exposes a layered import surface via the package `exports` map. All subpaths resolve to compiled `dist/*.js` and `dist/*.d.ts` files — the package tarball does **not** include TypeScript sources.

| Import                                 | Resolves to               | Notes                                                               |
| -------------------------------------- | ------------------------- | ------------------------------------------------------------------- |
| `@hoox-sh/hoox-shared`                 | `dist/index.js`           | Main barrel — everything in `src/index.ts`                          |
| `@hoox-sh/hoox-shared/<subdir>`        | `dist/<subdir>/index.js`  | Sub-barrel for the named subdirectory                               |
| `@hoox-sh/hoox-shared/<subdir>/<file>` | `dist/<subdir>/<file>.js` | Specific submodule file                                             |
| `@hoox-sh/hoox-shared/stores/<store>`  | `dist/stores/<store>.js`  | Zustand stores — deep-import only (no barrel)                       |
| `@hoox-sh/hoox-shared/types`           | `dist/types/index.d.ts`   | Type-only re-exports                                                |
| `@hoox-sh/hoox-shared/<anything-else>` | `dist/<anything-else>.js` | Catch-all for top-level modules (e.g. `errors`, `router`, `kvKeys`) |

The named subdirectories with deep-import support are: `middleware`, `d1`, `schemas`, `wizard`, `exchanges`. Each one re-exports its submodules from its `index.ts` barrel, so the bare-subdir form (`<subdir>`) and the deep form (`<subdir>/<file>`) return the same symbols — the bare form is just the pre-bundled rollup.

**Recommendation:** prefer the bare form for subdirectories (`hoox-shared/middleware`) unless you specifically need a single submodule to keep the import graph small. The bare form gives you a stable, curated surface; the deep form is for tree-shaking-conscious or very specific use cases.

## Development

```bash
bun test packages/shared
```
