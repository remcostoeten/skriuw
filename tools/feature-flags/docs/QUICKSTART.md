# Quickstart

1. Choose or implement a storage adapter.
2. Define your feature schema and defaults.
3. Provide an identity resolver (or use the default one).
4. Evaluate flags on the server and hydrate on the client.

```ts
import {
  createFeatureEngine,
  defaultIdentityResolver,
  InMemoryFeatureStore,
} from '@skriuw/feature-flags';

const engine = createFeatureEngine({
  storage: new InMemoryFeatureStore({
    definitions,
    segments,
  }),
  identityResolver: defaultIdentityResolver({ salt: 'example-app' }),
});

const { state } = await engine.evaluate({
  environment: 'production',
  userId: 'user_1',
});
```
