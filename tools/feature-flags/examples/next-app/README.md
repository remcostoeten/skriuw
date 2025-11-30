# Next.js integration example

This mini-app demonstrates how to evaluate feature flags on the server with `createFeatureEngine`, hydrate them in a client provider, and persist overrides.

## Highlights

- Server-side evaluation in `app/page.tsx`.
- Client provider that hydrates using the SSR snapshot and talks to LocalStorage for optimistic overrides.
- API route that persists overrides back to the engine (for demo purposes it writes to the in-memory store).
- Toggle panel rendered on the client with `useFeature` and `useFeatures` hooks.

Run the example inside a Next.js workspace and configure an app route to mount it.
