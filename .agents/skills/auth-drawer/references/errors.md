# Errors

The drawer routes errors to the right input and renders friendly copy. Adapters
produce `AuthUiError` values; the drawer never sees raw backend errors unless you
let them through.

## `AuthResult` and `AuthUiError`

```ts
type AuthResult<T = any> = { success: boolean; data?: T | null; error?: AuthUiError | null };

type AuthUiError = {
  code: AuthErrorCode;
  message: string;
  target: "email" | "password" | "confirmPassword" | "form" | "oauth";  // where the message renders
  provider?: OAuthProvider;
  retryable?: boolean;
  cause?: unknown;
};
```

`target` decides which field shows the message — e.g. `email` for "already
taken", `form` for invalid credentials, `oauth` for provider failures.

## Error codes

```ts
type AuthErrorCode =
  | "required"
  | "invalid_email"
  | "weak_password"
  | "password_mismatch"
  | "invalid_credentials"
  | "email_not_verified"
  | "email_taken"
  | "user_not_found"
  | "provider_unavailable"
  | "oauth_cancelled"
  | "popup_blocked"
  | "rate_limited"
  | "network_error"
  | "server_error"
  | "unknown";
```

Each code has built-in user-facing copy, so you usually only pick the code and
target — the drawer supplies the message.

## Producing errors in a custom adapter

The `AuthUiError` is a plain object — construct it inline. `message` is required;
the drawer also has built-in copy per code if you keep messages generic. Prefer
returning a failure result over throwing:

```ts
const err = (code, target, message) => ({ success: false, error: { code, target, message } });

async signIn({ email, password }) {
  const res = await fetch("/api/login", { /* ... */ });
  if (res.status === 429) return err("rate_limited", "form", "Too many attempts. Try again later.");
  if (res.status === 401) return err("invalid_credentials", "form", "Invalid email or password.");
  if (!res.ok)            return err("server_error", "form", "Something went wrong. Try again.");
  return { success: true, data: await res.json() };
}
```

> The package's internal `createAdapterError(code, target, rawError?)` helper
> (used by the prebuilt adapters) is **not** part of the public export surface —
> only the main export and the `adapters/*` subpaths are. So in a consumer app,
> build the `AuthUiError` literal yourself rather than importing that helper. Set
> `retryable: true` for transient codes (`network_error`, `server_error`,
> `rate_limited`) if you want the UI to offer a retry.

## `normalizeError` — handling thrown errors

If an adapter action **throws** (instead of returning a failure result), the
drawer routes the thrown value through `adapter.normalizeError` (or
`config.normalizeError`) to turn it into an `AuthUiError`. The default normalizer
accepts strings, objects with `code`/`status`/`message`, and nested `{ error }`
objects, and maps them to the closest code.

```ts
// adapter-level
const adapter = createAdapter({
  id: "my-backend",
  signIn,
  useSession,
  normalizeError: (err) => createAdapterError("unknown", "form", err),
});

// or config-level (signature includes context for provider/fallback)
const config: AuthConfig = {
  normalizeError: (err, { provider, fallbackTarget }) => /* AuthUiError */,
};
```

Prebuilt adapters already implement sensible mapping (e.g. Better Auth maps
`INVALID_EMAIL_OR_PASSWORD` → `invalid_credentials`, `USER_ALREADY_EXISTS` →
`email_taken`, `429`/`TOO_MANY_REQUESTS` → `rate_limited`, `5xx` →
`server_error`). For custom adapters, returning failure results with
`createAdapterError` is the simplest path; add `normalizeError` only if your code
can throw.

## Lifecycle callbacks

`AuthProvider` and `AuthDrawer` accept `onSuccess(action)` and
`onError(error, action)` where `action` is `"signIn" | "signUp" | "signOut" |
"oauth"`. Use them for toasts, route transitions, and analytics — not for error
display, which the drawer handles from the `AuthUiError`.
