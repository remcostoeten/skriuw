export type AuthEnv = Env & {
  AUTH_DB: D1Database;
  AUTH_TRUSTED_ORIGINS: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL: string;
};

function configuredOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function corsHeaders(request: Request, env: AuthEnv): Headers | null {
  const origin = request.headers.get("Origin");
  if (!origin) return new Headers();
  if (!configuredOrigins(env.AUTH_TRUSTED_ORIGINS).includes(origin)) return null;

  return new Headers({
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Expose-Headers": "set-auth-token",
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
    return withHeaders(
      Response.json({ error: "auth_not_configured" }, { status: 503 }),
      headers,
    );
  }

  const auth = await createAuth(env);
  return withHeaders(await auth.handler(request), headers);
}

export async function createAuth(env: AuthEnv) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error("auth_not_configured");
  }
  const [{ betterAuth }, { bearer }] = await Promise.all([
    import("better-auth"),
    import("better-auth/plugins"),
  ]);
  return betterAuth({
    appName: "Skriuw",
    baseURL: env.BETTER_AUTH_URL,
    database: env.AUTH_DB,
    emailAndPassword: { enabled: true },
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: configuredOrigins(env.AUTH_TRUSTED_ORIGINS),
    plugins: [bearer()],
  });
}

export const authInternals = { configuredOrigins };
