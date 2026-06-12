# Adapters

An adapter is the single bridge between `AuthDrawer`'s UI and an auth backend.
Either use a prebuilt factory (subpath import under
`@remcostoeten/auth-drawer/adapters/<name>`) or build one with `createAdapter`.

## The `AuthAdapter` contract

```ts
type AuthAdapter = {
  id: string;                       // required — stable identifier, e.g. "supabase"
  providers?: OAuthProvider[];      // which OAuth buttons to offer
  requiresName?: boolean;           // collect a name field during registration
  signIn: (input: CredentialAuthInput) => Promise<AuthResult>;           // required
  useSession: () => {                                                    // required (a hook!)
    data: AuthSessionState | null;
    isPending: boolean;
    error: unknown;
  };
  signUp?: (input: CredentialAuthInput & { name: string }) => Promise<AuthResult>;
  signOut?: () => Promise<AuthResult>;
  signInWithOAuth?: (provider: string) => Promise<AuthResult>;
  requestPasswordReset?: (email: string) => Promise<AuthResult>;
  resetPassword?: (input: ResetPasswordInput) => Promise<AuthResult>;
  features?: {                       // optional capabilities, auto-detected by the UI
    magicLink?: { signIn: (email: string) => Promise<AuthResult> };
    emailOtp?: {
      sendVerificationOtp: (email: string) => Promise<AuthResult>;
      signIn: (email: string, otp: string) => Promise<AuthResult>;
    };
    anonymous?: { signIn: () => Promise<AuthResult> };
  };
  normalizeError?: (error: unknown) => AuthUiError;
  onSuccess?: (action: "signIn" | "signUp" | "signOut" | "oauth") => void;
  onError?: (error: AuthUiError, action: ...) => void;
};

type CredentialAuthInput = { email: string; password: string; rememberMe: boolean };
type ResetPasswordInput = { newPassword: string };
type AuthSessionState = {
  user: { id: string; email: string; name?: string; image?: string | null; [k: string]: any } | null;
  session: any | null;
};
```

**Required:** `id`, `signIn`, `useSession`. Everything else is optional and drives
feature detection.

### Feature detection — what each method reveals

The drawer decides which UI to show from which methods exist. This is the key
behavior to internalize:

| Implement… | …and the UI shows |
| :-- | :-- |
| `signUp` | the Register tab |
| `signInWithOAuth` (+ `providers`) | the OAuth button group |
| `requestPasswordReset` | the forgot-password link |
| `resetPassword` | accepts a new password in reset mode |
| `features.magicLink` / `emailOtp` / `anonymous` | the corresponding extra flows |

Don't try to toggle these through `config`. To hide registration, omit `signUp`.
To hide OAuth, omit `signInWithOAuth`, pass `providers: []` on the adapter
factory, or keep `adapter.providers` and `config.ui.auth.providers` aligned
(the drawer prefers `adapter.providers` when both are set).

### `useSession` is a React hook

`useSession` is called once inside `AuthProvider`/`AuthDrawer` to suppress the
prompt for already-authenticated users. It must obey the Rules of Hooks — no
conditional hook calls. If the backend has no reactive session, return a static
`{ data: null, isPending: false, error: null }`.

### `AuthResult` and behavior

- Each action resolves to `{ success: boolean; data?; error?: AuthUiError | null }`.
- On failure, return `{ success: false, error }` rather than throwing where you can.
- Thrown errors are routed through `adapter.normalizeError` (or
  `config.normalizeError`).
- On a successful `signIn`/`signUp`/OAuth, the drawer closes automatically.
- `signIn` runs only after local email/password validation passes.

## `createAdapter` — custom adapters

Use `createAdapter` to fill in safe defaults for the methods you omit. It only
requires the fields you implement; `useSession` defaults to a static null
session and `signOut` defaults to a page reload.

```ts
import { createAdapter } from "@remcostoeten/auth-drawer";

export const myAdapter = createAdapter({
  id: "my-backend",
  providers: ["github", "google"],
  async signIn({ email, password, rememberMe }) {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, rememberMe }),
    });
    if (!res.ok) {
      // AuthUiError is a plain object — see errors.md for codes and targets
      return {
        success: false,
        error: { code: "invalid_credentials", target: "form", message: "Invalid email or password." },
      };
    }
    return { success: true, data: await res.json() };
  },
  // optional: add signUp / signInWithOAuth / requestPasswordReset to reveal more UI
  useSession() {
    // a real hook — wire to your session source, or omit to default to null
    return { data: null, isPending: false, error: null };
  },
});
```

The error codes, targets, and the full `AuthUiError` shape are in `errors.md`.
Note: the internal `createAdapterError` helper is **not** publicly exported, so a
custom adapter returns the `AuthUiError` object literal directly (or uses
`normalizeError`).

## Prebuilt adapter options

All factories return an `AuthAdapter`. Each accepts a typed options object.

### Better Auth — `createBetterAuthAdapter`

```ts
import { createBetterAuthAdapter } from "@remcostoeten/auth-drawer/adapters/better-auth";

createBetterAuthAdapter({
  client,                       // the Better Auth client (required)
  callbackURL?: string,         // default "/"
  newUserCallbackURL?: string,
  providers?: OAuthProvider[],  // defaults to client.options.socialProviders, else ["github","google"]
  requireName?: boolean,        // default true
  passwordResetRedirectTo?: string,
});
```

Auto-detects and wires `magicLink`, `emailOtp`, and `anonymous` from the client if
those methods exist. Maps Better Auth error codes to `AuthUiError`.

### Supabase — `createSupabaseAdapter`

```ts
import { createSupabaseAdapter } from "@remcostoeten/auth-drawer/adapters/supabase";

createSupabaseAdapter({
  supabase,                     // the Supabase client (required)
  redirectTo?: string,
  providers?: OAuthProvider[],
  requireName?: boolean,
  passwordResetRedirectTo?: string,
});
```

### Clerk — `createClerkAdapter`

```ts
import { createClerkAdapter } from "@remcostoeten/auth-drawer/adapters/clerk";

createClerkAdapter({
  client,                       // Clerk client (required)
  callbackURL?: string,
  providers?: OAuthProvider[],
  requireName?: boolean,
});
```

### NextAuth / Auth.js — `createNextAuthAdapter`

```ts
import { createNextAuthAdapter } from "@remcostoeten/auth-drawer/adapters/next-auth";

createNextAuthAdapter({
  client,                       // NextAuth client (signIn/signOut/useSession) (required)
  callbackURL?: string,
  providers?: OAuthProvider[],
  requireName?: boolean,
});
```

### Firebase — `createFirebaseAdapter`

Firebase's modular SDK is tree-shaken, so you pass the functions in rather than a
client object:

```ts
import { createFirebaseAdapter } from "@remcostoeten/auth-drawer/adapters/firebase";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, sendPasswordResetEmail, updatePassword, signInWithRedirect, GoogleAuthProvider,
} from "firebase/auth";

createFirebaseAdapter({
  auth: getAuth(app),                               // required
  createUserWithEmailAndPassword,                   // required
  signInWithEmailAndPassword,                       // required
  signOut,                                          // required
  sendPasswordResetEmail?,                          // enables forgot-password
  updatePassword?,                                  // enables reset
  signInWithRedirect?,                              // enables OAuth
  providerFactory?: (provider: string) => unknown,  // maps "google" -> new GoogleAuthProvider()
  providers?: OAuthProvider[],
  requireName?: boolean,
});
```

### Custom JWT / REST — `createCustomJwtAdapter`

For a plain REST backend that issues a JWT. Stores the token in `localStorage`
under `tokenStorageKey` and sends it as a Bearer token.

```ts
import { createCustomJwtAdapter } from "@remcostoeten/auth-drawer/adapters/custom-jwt";

createCustomJwtAdapter({
  baseUrl?: string,             // base for the default endpoint paths
  loginUrl?: string,            // override individual endpoints
  registerUrl?: string,
  logoutUrl?: string,
  profileUrl?: string,
  forgotPasswordUrl?: string,
  resetPasswordUrl?: string,
  tokenStorageKey?: string,     // localStorage key for the JWT
  providers?: OAuthProvider[],
  requireName?: boolean,
  oauthUrl?: (provider: string) => string,  // where to redirect for OAuth
  fetcher?: typeof fetch,       // inject a custom fetch (auth headers, mocking)
});
```

### Passport (session cookies) — `createPassportAdapter`

For a session-cookie Passport.js backend (no token storage).

```ts
import { createPassportAdapter } from "@remcostoeten/auth-drawer/adapters/passport";

createPassportAdapter({
  loginUrl?: string,
  logoutUrl?: string,
  userProfileUrl?: string,
  registerUrl?: string,
  requireName?: boolean,
  fetcher?: typeof fetch,
});
```

### Mock — `createMockAdapter`

For demos, Storybook, and local UI work before the backend exists. Holds an
in-memory authenticated flag and a fake user.

```ts
import { createMockAdapter } from "@remcostoeten/auth-drawer/adapters/mock";

createMockAdapter({
  latencyMs?: number,           // default 800 — simulate network delay
  mockEmail?: string,           // default "admin@example.com"
  mockPassword?: string,        // default "password"
  requireName?: boolean,
});
```

Sign in with the mock email/password to succeed; `spam@example.com` returns a
`rate_limited` error so you can exercise error states.
