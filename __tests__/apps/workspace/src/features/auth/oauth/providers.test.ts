import assert from "node:assert/strict";
import { test } from "vitest";
import { parseCloudProviders } from "@/features/auth/oauth/providers";
import { popupStartUrl } from "@/features/auth/oauth/popup";

test("only providers the client can sign in with are kept", () => {
  assert.deepEqual(parseCloudProviders({ authProviders: ["google", "gitlab", "github"] }), [
    "github",
    "google",
  ]);
});

test("a deployment that advertises nothing offers no providers", () => {
  assert.deepEqual(parseCloudProviders({}), []);
  assert.deepEqual(parseCloudProviders({ authProviders: [] }), []);
});

test("the popup names its opener origin and nonce", () => {
  const url = new URL(popupStartUrl("https://cloud.example", "google", "https://skriuw.com", "n1"));
  assert.equal(url.pathname, "/api/auth/oauth-popup/start");
  assert.equal(url.searchParams.get("provider"), "google");
  assert.equal(url.searchParams.get("popupOrigin"), "https://skriuw.com");
  assert.equal(url.searchParams.get("popupNonce"), "n1");
});
