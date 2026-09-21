import type { SessionStore } from "./session";

/**
 * Sign-in against the existing Better Auth Worker
 * (`docs/specs/cloud-sync-authentication.md`).
 *
 * The Expo-compatible flow is the bearer one, not the cookie one: the Worker
 * is a different origin from the app, React Native has no cookie jar worth
 * relying on, and the sync core already authenticates every request with a
 * bearer. So each response is read for `set-auth-token` and the credential
 * goes straight into the platform keystore.
 *
 * This is plain `fetch` rather than the `better-auth` client the desktop
 * renderer uses. It speaks the same routes and reads the same header; what it
 * deliberately does not do is carry that package's browser storage and cookie
 * handling into a place where neither exists.
 */

export type Account = {
  id: string;
  email: string;
  name: string | null;
};

export type SignedInSession = {
  account: Account;
  /** False when the keystore refused the write; the session is process-only. */
  persisted: boolean;
};

export type AuthFailureCode =
  | "invalid-credentials"
  | "already-registered"
  | "rate-limited"
  | "challenge-required"
  | "unavailable"
  | "network"
  | "invalid-response";

export type AuthFailure = {
  code: AuthFailureCode;
  /** Shown to the user. Never carries a provider message verbatim. */
  message: string;
};

export type AuthOutcome<T> = { ok: true; value: T } | { ok: false; error: AuthFailure };

export type Credentials = {
  email: string;
  password: string;
};

export type Registration = Credentials & {
  name: string;
};

export type AuthClient = {
  signIn: (credentials: Credentials) => Promise<AuthOutcome<SignedInSession>>;
  signUp: (registration: Registration) => Promise<AuthOutcome<SignedInSession>>;
  /** `null` when the stored credential is gone or the cloud refused it. */
  currentAccount: () => Promise<AuthOutcome<Account | null>>;
  /**
   * Ends the cloud session and clears the credential. The local clear happens
   * even when the revoke fails, so a device is never left holding a credential
   * the user believes they signed out of.
   */
  signOut: () => Promise<AuthOutcome<{ revoked: boolean }>>;
};

export type AuthClientOptions = {
  baseUrl: string;
  session: SessionStore;
  /** Injected so tests exercise the real request shapes. */
  fetch: typeof globalThis.fetch;
};

const MAX_BODY_BYTES = 64 * 1024;

const FAILURE_MESSAGES: Record<AuthFailureCode, string> = {
  "invalid-credentials": "That email and password do not match an account.",
  "already-registered": "An account already exists for that email.",
  "rate-limited": "Too many attempts. Wait a moment and try again.",
  "challenge-required":
    "Skriuw cloud needs an extra check this build cannot answer. Sign in on the desktop or web app once, then try again.",
  unavailable: "Skriuw cloud is unavailable right now. Try again shortly.",
  network: "Skriuw cloud could not be reached. Check your connection and try again.",
  "invalid-response": "Skriuw cloud answered with something this app cannot read.",
};

export function createAuthClient(options: AuthClientOptions): AuthClient {
  const { baseUrl, session } = options;

  async function call(
    path: string,
    init: { method: "GET" | "POST"; body?: unknown; bearer?: string | null },
  ): Promise<AuthOutcome<{ body: unknown; token: string | null }>> {
    let response: Response;
    try {
      response = await options.fetch(`${baseUrl}/api/auth${path}`, {
        method: init.method,
        headers: {
          Accept: "application/json",
          ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(init.bearer ? { Authorization: `Bearer ${init.bearer}` } : {}),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
    } catch {
      return failure("network");
    }

    const token = response.headers.get("set-auth-token");
    const body = await readBody(response);
    if (body === undefined) {
      return failure("invalid-response");
    }
    if (!response.ok) {
      return failure(statusCode(response.status, body));
    }
    return { ok: true, value: { body, token } };
  }

  async function authenticate(path: string, body: unknown): Promise<AuthOutcome<SignedInSession>> {
    const result = await call(path, { method: "POST", body });
    if (!result.ok) return result;
    const account = readAccount(result.value.body);
    if (account === null || result.value.token === null) {
      return failure("invalid-response");
    }
    const { persisted } = await session.remember(result.value.token);
    return { ok: true, value: { account, persisted } };
  }

  return {
    signIn: (credentials) => authenticate("/sign-in/email", credentials),

    signUp: (registration) => authenticate("/sign-up/email", registration),

    async currentAccount() {
      const bearer = await session.current();
      if (bearer === null) return { ok: true, value: null };
      const result = await call("/get-session", { method: "GET", bearer });
      if (!result.ok) {
        // A credential the cloud no longer honours is not a transient
        // failure: it is a signed-out device, and keeping it would leave the
        // account surface offering an account nothing can use.
        if (result.error.code === "invalid-credentials") {
          await session.forget();
          return { ok: true, value: null };
        }
        return result;
      }
      return { ok: true, value: readAccount(result.value.body) };
    },

    async signOut() {
      const bearer = await session.current();
      const result =
        bearer === null
          ? ({ ok: true } as const)
          : await call("/sign-out", { method: "POST", body: {}, bearer });
      await session.forget();
      return { ok: true, value: { revoked: result.ok } };
    },
  };
}

function failure<T>(code: AuthFailureCode): AuthOutcome<T> {
  return { ok: false, error: { code, message: FAILURE_MESSAGES[code] } };
}

/**
 * Maps a Worker status onto something the sign-in form can act on. Provider
 * text is never surfaced: the codes in `cloud-sync-authentication.md` are the
 * stable contract, the prose behind them is not.
 */
function statusCode(status: number, body: unknown): AuthFailureCode {
  if (status === 401 || status === 403) return "invalid-credentials";
  if (status === 409) return "already-registered";
  if (status === 429) return "rate-limited";
  // Sentinel answers an abuse verdict with a proof-of-work challenge the
  // desktop drawer solves through a plugin. Nothing here can solve it, so it
  // is named rather than reported as an opaque refusal.
  if (status === 423) return "challenge-required";
  if (status >= 500) return "unavailable";
  return readCode(body) === "USER_ALREADY_EXISTS" ? "already-registered" : "invalid-credentials";
}

async function readBody(response: Response): Promise<unknown> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    return undefined;
  }
  if (text.length > MAX_BODY_BYTES) return undefined;
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function readCode(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const code = (body as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

/**
 * Better Auth answers sign-in with `{ user, token }` and `get-session` with
 * `{ user, session }`, so the account is read from `user` either way.
 */
function readAccount(body: unknown): Account | null {
  if (typeof body !== "object" || body === null) return null;
  const user = (body as { user?: unknown }).user;
  if (typeof user !== "object" || user === null) return null;
  const { id, email, name } = user as { id?: unknown; email?: unknown; name?: unknown };
  if (typeof id !== "string" || typeof email !== "string") return null;
  return { id, email, name: typeof name === "string" ? name : null };
}
