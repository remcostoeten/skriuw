# Public API

## Core

- `createFeatureEngine(options)` – create an engine with a storage provider and optional caches.
- `evaluateDefinitionSet(definitions, context, identity, segments, options)` – pure evaluator.
- `defaultIdentityResolver({ salt })` – derives an identity from context.
- `InMemoryCache` – TTL-based cache implementation.

## React

- `FeatureProvider` – wraps your app and hydrates feature state.
- `useFeatures()` – returns the full state, override helpers, and hydration status.
- `useFeature(key)` – focused hook for a single feature.

## Next.js

- `createContextFromRequest(request, options)` – builds an evaluation context.
- `evaluateOnServer(engine, request, options)` – evaluates features inside a route handler.
- `createHydrationScript(snapshot)` – serializes the evaluated state for inline hydration.

## Storage providers

- `InMemoryFeatureStore` – for tests and Storybook.
- `LocalStorageFeatureStore` – browser persistence.
- `IndexedDBFeatureStore` – offline capable storage.
- `InstantDBFeatureStore` – remote storage example.
- `DrizzleFeatureStore` – relational storage using Drizzle ORM.
