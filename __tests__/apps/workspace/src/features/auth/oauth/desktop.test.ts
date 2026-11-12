import assert from "node:assert/strict";
import { test } from "vitest";
import { desktopStartUrl, parseDesktopCallback } from "@/features/auth/oauth/desktop";

const STATE = "s".repeat(43);

test("a deep link with this attempt's state and a token is accepted", () => {
  assert.deepEqual(parseDesktopCallback(`skriuw://auth/callback?state=${STATE}&token=abc`, STATE), {
    kind: "token",
    token: "abc",
  });
});

test("a provider error carries through with its code", () => {
  assert.deepEqual(
    parseDesktopCallback(`skriuw://auth/callback?state=${STATE}&error=access_denied`, STATE),
    { kind: "error", code: "access_denied" },
  );
});

test("a deep link for another attempt is ignored", () => {
  assert.equal(parseDesktopCallback("skriuw://auth/callback?state=other&token=abc", STATE), null);
  assert.equal(parseDesktopCallback("skriuw://auth/callback?token=abc", STATE), null);
});

test("a link that is not the sign-in callback is ignored", () => {
  assert.equal(parseDesktopCallback(`skriuw://open/note?state=${STATE}&token=abc`, STATE), null);
  assert.equal(parseDesktopCallback(`https://auth/callback?state=${STATE}&token=abc`, STATE), null);
  assert.equal(parseDesktopCallback("not a url", STATE), null);
  assert.equal(parseDesktopCallback(`skriuw://auth/callback?state=${STATE}`, STATE), null);
});

test("the system browser starts at the cloud desktop route with the state", () => {
  const url = new URL(desktopStartUrl("https://cloud.example", "github", STATE));
  assert.equal(url.origin, "https://cloud.example");
  assert.equal(url.pathname, "/v1/auth/desktop/start");
  assert.equal(url.searchParams.get("provider"), "github");
  assert.equal(url.searchParams.get("state"), STATE);
});
