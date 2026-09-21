import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authInternals, corsHeaders, handleAuthRequest } from "../src/auth";

describe("v2 auth boundary", () => {
  it("normalizes the exact trusted-origin allowlist", () => {
    expect(authInternals.configuredOrigins(" https://one.test,https://two.test, ")).toEqual([
      "https://one.test",
      "https://two.test",
    ]);
  });

  it("rejects untrusted browser origins before auth handling", async () => {
    const response = await handleAuthRequest(
      new Request("http://localhost:8787/api/auth/get-session", {
        headers: { Origin: "https://attacker.test" },
      }),
      env,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "origin_not_allowed" });
  });

  it("preflights the chunk upload methods the browser sync transport uses", () => {
    const headers = corsHeaders(
      new Request("http://localhost:8787/v1/workspaces/w_1/chunks/abc", {
        headers: { Origin: "https://skriuw.com" },
      }),
      env,
    );

    expect(headers).not.toBeNull();
    const allowedMethods = headers?.get("Access-Control-Allow-Methods") ?? "";
    for (const method of ["GET", "HEAD", "POST", "PUT"]) {
      expect(allowedMethods).toContain(method);
    }
    expect(headers?.get("Access-Control-Allow-Headers")).toContain("Authorization");
  });

  it("preflights and exposes the Sentinel browser protocol headers", async () => {
    const response = await handleAuthRequest(
      new Request("http://localhost:8787/api/auth/get-session", {
        method: "OPTIONS",
        headers: {
          Origin: "https://skriuw.com",
          "Access-Control-Request-Headers": "x-request-id,x-visitor-id",
          "Access-Control-Request-Method": "GET",
        },
      }),
      env,
    );

    expect(response.status).toBe(204);
    const allowedHeaders = response.headers.get("Access-Control-Allow-Headers") ?? "";
    for (const header of ["X-PoW-Solution", "X-Request-Id", "X-Visitor-Id"]) {
      expect(allowedHeaders).toContain(header);
    }
    const exposedHeaders = response.headers.get("Access-Control-Expose-Headers") ?? "";
    for (const header of ["set-auth-token", "X-PoW-Challenge", "X-PoW-Reason"]) {
      expect(exposedHeaders).toContain(header);
    }
  });

  it("fails closed without a production session secret", async () => {
    const response = await handleAuthRequest(
      new Request("http://localhost:8787/api/auth/get-session", {
        headers: { Origin: "https://skriuw.com" },
      }),
      env,
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://skriuw.com");
    expect(await response.json()).toEqual({ error: "auth_not_configured" });
  });
});
