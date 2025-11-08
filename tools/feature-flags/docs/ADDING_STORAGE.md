# Adding a Storage Provider

1. Implement the `StorageProvider` interface from `@skriuw/feature-flags/core`.
2. Wire the provider into your app's dependency graph.
3. Optionally expose it from `adapters/` for reuse.

Each provider must handle:

- Loading environment-specific definitions.
- Fetching and persisting per-identity overrides.
- Returning segment definitions.
- Exposing a monotonically increasing `version` or checksum used for caching.

The simplest path is to extend `AbstractAsyncCache` or compose with it to provide in-memory caching in front of your data source.
