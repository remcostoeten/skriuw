# Triggers — auto-opening the surface

Triggers let something other than a click open the auth surface: page load, a
scroll threshold, idle time, an expired session, or any custom app event. They
split into two roles:

1. **Config** (`config.triggers.*`) — declares which rules are active + their policy.
2. **Events** (`triggerStore.emit(...)`) — tells the store something happened.

`AuthDrawer` registers every configured rule against a trigger store and opens
the surface when the store decides a rule fires.

## When you need a shared store

| Trigger | Config key | Who emits the event? | Needs shared store? |
| :-- | :-- | :-- | :-- |
| Page load | `pageLoad` | `AuthDrawer` on mount (respects `delayMs`) | No |
| Click | `click` | `AuthDrawer` on a matching document event | No |
| Scroll | `scrollOpen` | Host app (usually `useScrollOpenTrigger` + emit) | Yes |
| Auth state | `state` | Host app (API client, route guard, 401 handler) | Yes |
| Idle | `idle` | Host app (your idle detector) | Yes |
| Custom | `custom` | Host app (any named channel) | Yes |

`pageLoad` and `click` work with no `triggerStore` prop — `AuthDrawer` makes one
internally. For scroll/state/idle/custom, create one store and pass it to both
the drawer and the emitting code.

## Trigger config

```ts
type AuthTriggerConfig = {
  pageLoad?: TriggerPolicy & { delayMs?: number };
  click?:    TriggerPolicy & { selector?: string; event?: "click" | "pointerdown" };
  state?:    TriggerPolicy & { state: "denied" | "expired" | "missing" };
  scrollOpen?: TriggerPolicy & { threshold?: number; container?: "self" | "page" };
  idle?:     TriggerPolicy & { idleMs: number };
  custom?:   TriggerPolicy & { event: string };
};

type TriggerPolicy = {
  once?: boolean;        // fire at most once per scope bucket
  cooldownMs?: number;   // minimum time between firings
  scope?: "session" | "day" | "week" | "install"; // eligibility bucket
  every?: number;        // fire only on every Nth matching event
  sampleRate?: number;   // random gate, 0..1
};
```

`scope`: `session` is in-memory; `day`/`week`/`install` persist via storage
(localStorage by default). `scrollOpen.once` defaults to `true`; other kinds
default `once` to `false`.

## Shared-store wiring (scroll paywall example)

```tsx
import {
  AuthDrawer, createAuthTriggerStore, useScrollOpenTrigger, type AuthConfig,
} from "@remcostoeten/auth-drawer";
import { useRef } from "react";

const triggerStore = createAuthTriggerStore();

const config: AuthConfig = {
  triggers: {
    pageLoad: { delayMs: 800, once: true },
    scrollOpen: { threshold: 0.25, once: true, cooldownMs: 30_000 },
    state: { state: "expired", once: true },
    custom: { event: "paywall:blocked", scope: "session" },
  },
};

function ArticlePaywall() {
  const articleRef = useRef<HTMLDivElement>(null);

  useScrollOpenTrigger({
    containerRef: articleRef,
    threshold: config.triggers?.scrollOpen?.threshold ?? 0.25,
    once: config.triggers?.scrollOpen?.once ?? true,
    enabled: Boolean(config.triggers?.scrollOpen),
    onTrigger: (progress) =>
      triggerStore.emit({ kind: "scrollOpen", progress, container: "self" }),
  });

  return (
    <>
      <div ref={articleRef}>{/* scrollable article */}</div>
      <AuthDrawer adapter={adapter} config={config} triggerStore={triggerStore} hideTrigger />
    </>
  );
}
```

## Emitting events

```ts
// 401 / session expired
triggerStore.emit({ kind: "state", state: "expired", reason: "session-expired" });

// app-defined paywall
triggerStore.emit({ kind: "custom", event: "paywall:blocked", payload: { layer: "comments" } });

// idle detector crossed threshold
triggerStore.emit({ kind: "idle", idleMs: 60_000 });
```

### `AuthTriggerEvent` shapes and matching rules

```ts
type AuthTriggerEvent =
  | { kind: "pageLoad"; source?: "mount" | "manual" }
  | { kind: "click"; selector?: string; event?: "click" | "pointerdown"; target?: EventTarget | null }
  | { kind: "state"; state: "denied" | "expired" | "missing"; reason?: string; payload?: unknown }
  | { kind: "scrollOpen"; progress: number; threshold?: number; container?: "self" | "page" }
  | { kind: "idle"; idleMs: number }
  | { kind: "custom"; event: string; payload?: unknown };
```

- `scrollOpen` fires when `event.progress >= config.threshold` (default `0.25`).
- `state` fires when `event.state === config.state`.
- `idle` fires when `event.idleMs >= config.idleMs`.
- `custom` fires when `event.event === config.event`.
- `click` fires when selector/event match (if `config.selector` is set, the
  event target must match it).

## Store API

```ts
const store = createAuthTriggerStore({
  namespace?: string;   // default "auth-drawer"
  storage?: AuthTriggerStorage;  // {getItem,setItem,removeItem}; default localStorage
  now?: () => number;
  random?: () => number;  // inject for deterministic sampling in tests
});

store.emit(event);
store.subscribe(listener);          // returns unsubscribe
store.snapshot();                   // { seenCounts, fireCounts, lastSeenAt, lastFiredAt }
store.clear(kind?);
// store.registerTrigger(kind, config, onFire) is used internally by AuthDrawer
```

Inject `now`/`random`/`storage` to make cooldown, scope, and sampling
deterministic in tests.

## `useScrollOpenTrigger`

```ts
useScrollOpenTrigger({
  containerRef,                 // ref to the scrollable element
  onTrigger: (progress: number) => void,
  threshold?: number,           // default 0.25
  once?: boolean,               // default true
  enabled?: boolean,            // default true
});
```

Observes normalized scroll progress (0 = top, 1 = bottom) on `containerRef` and
calls `onTrigger` when the threshold is crossed. Pair it with
`triggerStore.emit({ kind: "scrollOpen", progress, ... })` so policy stays
centralized in the store.
