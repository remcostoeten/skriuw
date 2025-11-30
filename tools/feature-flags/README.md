# @skriuw/feature-flags

A modular feature flag engine written in TypeScript with first-class React/Next.js bindings and multiple storage providers.

## Packages

This package bundles the core engine, storage adapters, and framework integrations:

- `@skriuw/feature-flags/core` – evaluation engine, identity resolution, caching utilities.
- `@skriuw/feature-flags/react` – React provider and hooks with SSR-safe hydration.
- `@skriuw/feature-flags/next` – Helpers for Next.js Route Handlers, middleware, and server evaluation.
- Storage adapters for Drizzle ORM, LocalStorage, IndexedDB, InstantDB, and in-memory usage.

## Getting started

```bash
bun add @skriuw/feature-flags
# or
npm install @skriuw/feature-flags
```

Define your schema and boot the engine:

```ts
import { createFeatureEngine } from '@skriuw/feature-flags';

const engine = createFeatureEngine({
  storage,
  cache,
  identityResolver,
});

const { state } = await engine.evaluate({
  environment: 'production',
  userId: 'user_123',
});
```

For framework bindings and full documentation see `docs/` within this directory.
