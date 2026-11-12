import { configuredOAuthProviders, createAuth, type AuthEnv, type OAuthProviderId } from "./auth";

const DESKTOP_CALLBACK_URL = "skriuw://auth/callback";
const START_PATH = "/v1/auth/desktop/start";
const COMPLETE_PATH = "/v1/auth/desktop/complete";
const STATE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const ERROR_CODE_PATTERN = /^[a-z0-9_]{1,64}$/;

function isConfiguredProvider(
  provider: string | null,
  configured: OAuthProviderId[],
): provider is OAuthProviderId {
  return configured.some((id) => id === provider);
}

function htmlResponse(status: number, body: string, head = ""): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Skriuw</title>${head}<style>body{font:16px/1.5 system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem}</style></head><body>${body}</body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}

function escapeAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

function handoffPage(parameters: Record<string, string>): Response {
  const target = `${DESKTOP_CALLBACK_URL}?${new URLSearchParams(parameters).toString()}`;
  const href = escapeAttribute(target);
  return htmlResponse(
    200,
    `<h1>Back to Skriuw</h1><p>Skriuw should open now. If it does not, <a href="${href}">open Skriuw</a>. You can close this tab afterwards.</p>`,
    `<meta http-equiv="refresh" content="0;url=${href}">`,
  );
}

function failurePage(status: number): Response {
  return htmlResponse(
    status,
    "<h1>Sign-in could not start</h1><p>Return to Skriuw and try again.</p>",
  );
}

async function startSignIn(request: Request, env: AuthEnv): Promise<Response> {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider");
  const state = url.searchParams.get("state");
  if (
    !isConfiguredProvider(provider, configuredOAuthProviders(env)) ||
    state === null ||
    !STATE_PATTERN.test(state)
  ) {
    return failurePage(400);
  }

  const complete = `${new URL(env.BETTER_AUTH_URL).origin}${COMPLETE_PATH}?state=${state}`;
  const auth = await createAuth(env);
  const { headers, response } = await auth.api.signInSocial({
    body: {
      provider,
      callbackURL: complete,
      errorCallbackURL: complete,
      disableRedirect: true,
    },
    returnHeaders: true,
  });
  if (!response.url) return failurePage(502);

  const redirect = new Headers({ Location: response.url, "Cache-Control": "no-store" });
  for (const cookie of headers.getSetCookie()) redirect.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers: redirect });
}

async function completeSignIn(request: Request, env: AuthEnv): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  if (state === null || !STATE_PATTERN.test(state)) return failurePage(400);

  const reported = url.searchParams.get("error");
  if (reported !== null) {
    const error = ERROR_CODE_PATTERN.test(reported) ? reported : "sign_in_failed";
    return handoffPage({ state, error });
  }

  const auth = await createAuth(env);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return handoffPage({ state, error: "sign_in_failed" });

  const { token } = await auth.api.generateOneTimeToken({ headers: request.headers });
  return handoffPage({ state, token });
}

/**
 * @name handleDesktopSignInRequest
 * @description Serves the two browser-facing routes of the desktop OAuth
 * hand-off. `start` is opened in the system browser so the provider state
 * cookie lands there, and `complete` trades the resulting session for a
 * one-time token that returns to the app through the `skriuw://` scheme.
 *
 * @example
 * if (url.pathname.startsWith("/v1/auth/desktop/")) {
 *   return handleDesktopSignInRequest(request, env);
 * }
 */
export async function handleDesktopSignInRequest(
  request: Request,
  env: AuthEnv,
): Promise<Response> {
  if (request.method !== "GET")
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const { pathname } = new URL(request.url);
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
    return Response.json({ error: "auth_not_configured" }, { status: 503 });
  }
  if (pathname === START_PATH) return startSignIn(request, env);
  if (pathname === COMPLETE_PATH) return completeSignIn(request, env);
  return Response.json({ error: "not_found" }, { status: 404 });
}
