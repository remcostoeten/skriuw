export type AuthEnv = Env & {
  AUTH_DB: D1Database;
  AUTH_TRUSTED_ORIGINS: string;
  BETTER_AUTH_API_KEY?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
};

export const OAUTH_PROVIDER_IDS = ["github", "google"] as const;
export type OAuthProviderId = (typeof OAUTH_PROVIDER_IDS)[number];

type SocialProviders = Partial<Record<OAuthProviderId, { clientId: string; clientSecret: string }>>;

export const AUTH_FRESH_SESSION_AGE_SECONDS = 24 * 60 * 60;

function configuredOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function socialProviders(env: AuthEnv): SocialProviders {
  const providers: SocialProviders = {};
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    providers.github = { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET };
  }
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
  }
  return providers;
}

/**
 * @name configuredOAuthProviders
 * @description Lists the OAuth providers this deployment has both a client id
 * and a client secret for. A provider with half its credentials is not listed.
 *
 * @example
 * configuredOAuthProviders(env); // ["github"]
 */
export function configuredOAuthProviders(env: AuthEnv): OAuthProviderId[] {
  const providers = socialProviders(env);
  return OAUTH_PROVIDER_IDS.filter((id) => providers[id] !== undefined);
}

export function corsHeaders(request: Request, env: AuthEnv): Headers | null {
  const origin = request.headers.get("Origin");
  if (!origin) return new Headers();
  if (!configuredOrigins(env.AUTH_TRUSTED_ORIGINS).includes(origin)) return null;

  return new Headers({
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, X-PoW-Solution, X-Request-Id, X-Visitor-Id",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Expose-Headers": "set-auth-token, X-PoW-Challenge, X-PoW-Reason",
    Vary: "Origin",
  });
}

export function withHeaders(response: Response, headers: Headers): Response {
  const merged = new Headers(response.headers);
  headers.forEach((value, key) => merged.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: merged,
  });
}

export async function handleAuthRequest(request: Request, env: AuthEnv): Promise<Response> {
  const headers = corsHeaders(request, env);
  if (!headers) {
    return Response.json({ error: "origin_not_allowed" }, { status: 403 });
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
    return withHeaders(Response.json({ error: "auth_not_configured" }, { status: 503 }), headers);
  }

  const auth = await createAuth(env);
  return withHeaders(await auth.handler(request), headers);
}

export async function createAuth(env: AuthEnv) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error("auth_not_configured");
  }
  const [{ betterAuth }, { bearer, oauthPopup, oneTimeToken }] = await Promise.all([
    import("better-auth"),
    import("better-auth/plugins"),
  ]);
  return betterAuth({
    appName: "Skriuw",
    baseURL: env.BETTER_AUTH_URL,
    database: env.AUTH_DB,
    emailAndPassword: { enabled: true },
    socialProviders: socialProviders(env),
    session: { freshAge: AUTH_FRESH_SESSION_AGE_SECONDS },
    user: { deleteUser: { enabled: true } },
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: configuredOrigins(env.AUTH_TRUSTED_ORIGINS),
    plugins: [
      bearer(),
      oauthPopup(),
      oneTimeToken({ expiresIn: 1, storeToken: "hashed", disableClientRequest: true }),
      ...(await infraPlugins(env)),
    ],
  });
}

// The Infra plugins read their key from `process.env` when none is passed,
// which a Worker binding never populates. It is also the only reason the
// deployment talks to a third party, so an unset key keeps both plugins off the
// route table instead of shipping them in a permanently unauthenticated state.
// Sentinel in particular degrades to warning at startup and cannot reach the
// infra APIs without it.
async function infraPlugins(env: AuthEnv) {
  const apiKey = env.BETTER_AUTH_API_KEY;
  if (!apiKey) return [];
  const { dash, sentinel } = await import("@better-auth/infra");
  return [
    dash({ apiKey }),
    sentinel({
      apiKey,
      security: {
        credentialStuffing: { enabled: true, thresholds: { challenge: 3, block: 5 } },
      },
    }),
  ];
}

export const authInternals = { configuredOrigins };
