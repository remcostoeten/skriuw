import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { configuredOAuthProviders, type AuthEnv } from "../../../apps/sync/src/auth";
import { handleDesktopSignInRequest } from "../../../apps/sync/src/desktop-sign-in";

const STATE = "a".repeat(40);

function configured(overrides: Partial<AuthEnv> = {}): AuthEnv {
  return {
    ...env,
    BETTER_AUTH_SECRET: "x".repeat(40),
    BETTER_AUTH_URL: env.BETTER_AUTH_URL,
    GITHUB_CLIENT_ID: "github-id",
    GITHUB_CLIENT_SECRET: "github-secret",
    ...overrides,
  };
}

function desktopRequest(path: string): Request {
  return new Request(`https://auth.test${path}`);
}

describe("OAuth providers", () => {
  it("lists only providers that have both a client id and a secret", () => {
    expect(configuredOAuthProviders(configured())).toEqual(["github"]);
    expect(
      configuredOAuthProviders(
        configured({ GOOGLE_CLIENT_ID: "google-id", GOOGLE_CLIENT_SECRET: "google-secret" }),
      ),
    ).toEqual(["github", "google"]);
    expect(configuredOAuthProviders(configured({ GITHUB_CLIENT_SECRET: undefined }))).toEqual([]);
  });
});

describe("desktop OAuth hand-off", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.AUTH_DB, env.TEST_MIGRATIONS);
  });

  it("sends the system browser to the provider with the state cookie", async () => {
    const response = await handleDesktopSignInRequest(
      desktopRequest(`/v1/auth/desktop/start?provider=github&state=${STATE}`),
      configured(),
    );

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("Location") ?? "");
    expect(location.origin).toBe("https://github.com");
    expect(location.searchParams.get("client_id")).toBe("github-id");
    expect(location.searchParams.get("redirect_uri")).toBe(
      `${env.BETTER_AUTH_URL}/api/auth/callback/github`,
    );
    expect(response.headers.getSetCookie().length).toBeGreaterThan(0);
  });

  it("refuses a provider the deployment has no credentials for", async () => {
    const response = await handleDesktopSignInRequest(
      desktopRequest(`/v1/auth/desktop/start?provider=google&state=${STATE}`),
      configured(),
    );

    expect(response.status).toBe(400);
  });

  it("refuses a state the app could not have generated", async () => {
    const response = await handleDesktopSignInRequest(
      desktopRequest("/v1/auth/desktop/start?provider=github&state=short"),
      configured(),
    );

    expect(response.status).toBe(400);
  });

  it("returns a provider error to the app without a token", async () => {
    const response = await handleDesktopSignInRequest(
      desktopRequest(`/v1/auth/desktop/complete?state=${STATE}&error=access_denied`),
      configured(),
    );

    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain(`skriuw://auth/callback?state=${STATE}&#38;error=access_denied`);
    expect(body).not.toContain("token=");
  });

  it("reports a failed sign-in when the browser holds no session", async () => {
    const response = await handleDesktopSignInRequest(
      desktopRequest(`/v1/auth/desktop/complete?state=${STATE}`),
      configured(),
    );

    const body = await response.text();
    expect(body).toContain("error=sign_in_failed");
    expect(body).not.toContain("token=");
  });

  it("only answers GET", async () => {
    const response = await handleDesktopSignInRequest(
      new Request(`https://auth.test/v1/auth/desktop/start?provider=github&state=${STATE}`, {
        method: "POST",
      }),
      configured(),
    );

    expect(response.status).toBe(405);
  });

  it("fails closed without a session secret", async () => {
    const response = await handleDesktopSignInRequest(
      desktopRequest(`/v1/auth/desktop/start?provider=github&state=${STATE}`),
      configured({ BETTER_AUTH_SECRET: undefined }),
    );

    expect(response.status).toBe(503);
  });
});
