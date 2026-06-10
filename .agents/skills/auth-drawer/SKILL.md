---
name: auth-drawer
description: >-
  Integrate the @remcostoeten/auth-drawer React library (a sign-in/sign-up
  drawer or modal) into a consumer app. Use this whenever the user wants to add
  a login/signup/auth surface, an "auth drawer" or "auth modal", wrap their app
  in AuthProvider, render <AuthDrawer>, call useAuth(), pick or write an auth
  adapter (Better Auth, Supabase, Clerk, NextAuth, Firebase, custom JWT/REST,
  Passport, or createMockAdapter), or configure auth triggers/theming for that package.
  Use it even if the user only mentions the auth backend (e.g. "add a Supabase
  login drawer") and doesn't name the package, as long as @remcostoeten/auth-drawer
  is or will be the UI. Do NOT use it for unrelated drawer/sheet UI, for
  configuring an auth backend with no auth-drawer UI, or for other auth UI kits.
---

# Auth Drawer Integration

`@remcostoeten/auth-drawer` is a headless-ish React auth surface — a drawer or
modal with email/password, OAuth buttons, registration, forgot-password, and
configurable triggers. It does **not** talk to any auth backend directly.
Instead an **adapter** bridges the UI to whatever auth engine the app uses. Your
job is to wire three things together correctly and pick the right adapter.

## The mental model

The library splits cleanly into UI and backend:

- **UI** (`AuthDrawer`, `AuthProvider`, `useAuth`) — ships with the package.
- **Adapter** — an object implementing `AuthAdapter`. Either use a prebuilt one
  (`@remcostoeten/auth-drawer/adapters/<name>`) or build a custom one with
  `createAdapter`. The adapter is the **only** integration point with the auth
  backend.
- **Config** (`AuthConfig`) — purely declarative: how the surface looks
  (`ui.*`) and what opens it (`triggers.*`). Never auth logic.

The drawer uses **feature detection** on the adapter: it shows or hides UI based
on which optional methods the adapter implements. Implement `signUp` and the
Register tab appears; implement `signInWithOAuth` and OAuth buttons appear;
implement `requestPasswordReset` and the forgot-password link appears. This is
why choosing/shaping the adapter is the most consequential step — don't try to
toggle these via config.

```sh
# pick the user's package manager (check for bun.lock / pnpm-lock.yaml / package-lock.json)
bun add @remcostoeten/auth-drawer
```

Peer dependencies the host app must already have (install if missing):
`react` (^18 || ^19), `react-dom`, `framer-motion` (^12), `lucide-react`.

**Styles are included out of the box.** The package entry imports its bundled
CSS as a side effect (and `package.json` marks `*.css` as side-effecting), so
just importing from `@remcostoeten/auth-drawer` brings the styles with it — no
manual CSS import needed.

Only reach for the standalone export in special cases:

```ts
// Optional. Use only if your bundler strips CSS side effects, or you want to
// control stylesheet order explicitly:
import "@remcostoeten/auth-drawer/styles.css";
// Or, for Tailwind projects that prefer the source layer over the prebuilt CSS:
import "@remcostoeten/auth-drawer/styles/tailwind.css";
```

## Minimal wiring (the happy path)

Three pieces. Build them in this order.

**1. Create the adapter** (see `references/adapters.md` to choose — start with
`createMockAdapter` if the backend isn't ready):

```ts
import { createBetterAuthAdapter } from "@remcostoeten/auth-drawer/adapters/better-auth";
import { authClient } from "@/lib/auth-client";

export const authAdapter = createBetterAuthAdapter({ client: authClient });
```

**2. Wrap the app in `AuthProvider`** — it calls `adapter.useSession()` once and
exposes session + drawer controls through context:

```tsx
import { AuthProvider } from "@remcostoeten/auth-drawer";
import { authAdapter } from "./auth-adapter";

export function App({ children }) {
  return <AuthProvider adapter={authAdapter}>{children}</AuthProvider>;
}
```

**3. Render `<AuthDrawer>`** somewhere inside the provider:

```tsx
import { AuthDrawer } from "@remcostoeten/auth-drawer";

<AuthDrawer adapter={authAdapter} />;
```

By default `AuthDrawer` renders its own floating trigger button. To drive it from
your own UI instead, set `hideTrigger`. When the drawer is inside
`AuthProvider` and no `open`/`onOpenChange` props are passed, `useAuth()` controls
its open state. Pass `open`/`onOpenChange` only when the host app needs explicit
controlled state.

**Read session + open the drawer from anywhere** under the provider:

```tsx
import { useAuth } from "@remcostoeten/auth-drawer";

function Header() {
  const { user, isPending, openDrawer, signOut } = useAuth();
  if (isPending) return null;
  return user
    ? <button onClick={signOut}>Sign out {user.email}</button>
    : <button onClick={openDrawer}>Sign in</button>;
}
```

`useAuth()` throws if called outside `AuthProvider` — keep the provider above
every consumer.

## CSS token customization

Theme the packaged surface by overriding the existing HSL component tokens in
app CSS. Do not document or invent a `cad-*` theme API.

```css
:root {
  --surface-overlay: 34 12% 82%;
  --text-on-overlay: 24 18% 14%;
  --border-overlay: 28 12% 54%;
}
```

## Choosing an adapter

| Backend | Import | Factory |
| :-- | :-- | :-- |
| Better Auth | `.../adapters/better-auth` | `createBetterAuthAdapter({ client })` |
| Supabase | `.../adapters/supabase` | `createSupabaseAdapter({ supabase })` |
| Clerk | `.../adapters/clerk` | `createClerkAdapter({ client })` |
| NextAuth / Auth.js | `.../adapters/next-auth` | `createNextAuthAdapter({ client })` |
| Firebase | `.../adapters/firebase` | `createFirebaseAdapter({ auth, ...fns })` |
| Custom JWT / REST | `.../adapters/custom-jwt` | `createCustomJwtAdapter({ baseUrl })` |
| Passport (session) | `.../adapters/passport` | `createPassportAdapter({ ... })` |
| Mock / demo | `.../adapters/mock` | `createMockAdapter()` |
| Anything else | (main export) | `createAdapter({ id, signIn, useSession, ... })` |

All paths are subpath imports under `@remcostoeten/auth-drawer`. For exact option
shapes, OAuth handling, and `createAdapter` custom-adapter rules (including which
methods are required vs. optional and how `useSession` must obey the Rules of
Hooks), read **`references/adapters.md`** before writing adapter code.

## Configuration

Pass a `config?: AuthConfig` to `AuthDrawer`. Everything is optional and merged
over `DEFAULT_CONFIG`. Two namespaces:

- `config.ui.*` — appearance & form behavior: `auth` (providers, register/remember
  flags, initial mode, email autocomplete), `copy` (all labels/messages),
  `presentation` (`variant: "drawer" | "modal"`, `defaultOpen`), `visual.backdrop`,
  `motion`, and a custom `footer`.
- `config.triggers.*` — rules that auto-open the surface.

```tsx
<AuthDrawer
  adapter={authAdapter}
  config={{
    ui: {
      auth: { providers: ["github", "google"], allowRegister: true },
      presentation: { variant: "modal" },
    },
  }}
/>;
```

`ui.auth.providers` may be `[]` to disable OAuth entirely (the button group and
divider disappear). Valid providers: `github`, `google`, `apple`, `discord`,
`tiktok`. For the full config tree, defaults, theming, and copy overrides, read
**`references/config.md`**.

## Triggers (auto-opening the surface)

For "open on scroll", "open after idle", "open on a 401/expired session", or
"open from non-React code", use the trigger system: declare rules in
`config.triggers.*` and emit events into a shared `createAuthTriggerStore()` that
you pass to `AuthDrawer` via `triggerStore`. `pageLoad` and `click` triggers work
with no store; scroll/state/idle/custom need the shared store. Full patterns
(including `useScrollOpenTrigger` and `TriggerPolicy`: `once`/`cooldownMs`/
`scope`/`every`/`sampleRate`) are in **`references/triggers.md`**.

## Error handling

Adapter actions return `AuthResult` (`{ success, data?, error? }`). On failure,
return `{ success: false, error }` where `error` is an `AuthUiError` with a
`code` and a `target` field that routes the message to the right input (`email`,
`password`, `confirmPassword`, `form`, or `oauth`). Prebuilt adapters already map
backend errors; for a custom adapter, return the `AuthUiError` object literal
(the internal `createAdapterError` helper isn't publicly exported) or implement
`normalizeError`. Error codes and the full shape are in **`references/errors.md`**.

## Common gotchas

- **Don't manually add the CSS import** unless you have a reason — styles come in
  automatically via the package's side-effecting entry. Only import
  `@remcostoeten/auth-drawer/styles.css` explicitly if your bundler strips CSS
  side effects and the drawer renders unstyled.
- **`useAuth()` outside the provider** → throws. The provider must wrap every
  consumer, including the component that renders `<AuthDrawer>` if it reads context.
- **Trying to hide the Register tab / OAuth via config** → won't work for
  registration (omit `signUp` on the adapter). For OAuth, the drawer prefers
  `adapter.providers` over `config.ui.auth.providers`; pass `providers: []` on the
  adapter factory, omit `signInWithOAuth`, or keep both lists aligned.
- **`useSession` must follow the Rules of Hooks** — it is a React hook called
  inside the provider. A custom adapter's `useSession` may not call other hooks
  conditionally. If you have no reactive session, return a static
  `{ data: null, isPending: false, error: null }` (this is what `createAdapter`
  defaults to).
- **SSR / Next.js** — `AuthProvider`, `AuthDrawer`, and `useAuth` are client-side.
  Put them in a `"use client"` boundary. Add `<div id="auth-drawer-portal" />` in
  your root layout so the drawer portals above page content (without it, the drawer
  still works but renders inline).
- **Success callbacks inside a provider** — drawer submissions already invoke
  `AuthProvider`'s `onSuccess`. Prefer provider-level (or `adapter.onSuccess`)
  handlers for redirects; `AuthDrawer`'s `onSuccess` is optional and stacks on top.
- **Don't reach into the package internals** — the public API is exactly what the
  main export and the `adapters/*` subpaths expose. Build against those.

## Reference files

- `references/adapters.md` — every prebuilt adapter's options, the `AuthAdapter`
  contract, and how to write a custom adapter with `createAdapter`.
- `references/config.md` — the full `AuthConfig` tree, `DEFAULT_CONFIG`, theming
  (`visual`/`motion`), copy overrides, and email autocomplete.
- `references/triggers.md` — the trigger store, declarative trigger config,
  `useScrollOpenTrigger`, emit patterns, and `TriggerPolicy`.
- `references/errors.md` — `AuthResult`, `AuthUiError`, all error codes, and
  `normalizeError`.
