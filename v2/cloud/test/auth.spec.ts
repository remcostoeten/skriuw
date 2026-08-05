import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authInternals, handleAuthRequest } from "../src/auth";

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
