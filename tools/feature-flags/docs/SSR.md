# SSR & Hydration

- Evaluate features on the server using the incoming request context.
- Serialize the snapshot via `createHydrationPayload` and pass it to the client.
- On the client, `FeatureProvider` consumes the snapshot and re-evaluates once hydrated to avoid flicker.
- Optimistic updates call `setOverride` which updates UI immediately while persisting overrides in the background.
