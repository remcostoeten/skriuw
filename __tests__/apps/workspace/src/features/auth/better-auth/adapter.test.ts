import assert from "node:assert/strict";
import { test } from "vitest";
import { signInCallbackPath } from "@/features/auth/better-auth/adapter";

test("the sign-in callback is the page the user signed in from", () => {
  assert.equal(signInCallbackPath("/app/"), "/app/");
  assert.equal(signInCallbackPath("/app"), "/app");
  assert.equal(signInCallbackPath("/"), "/");
});

test("a path Better Auth would refuse as a callback falls back to the root", () => {
  assert.equal(signInCallbackPath("//elsewhere.example"), "/");
  assert.equal(signInCallbackPath("/%2felsewhere.example"), "/");
  assert.equal(signInCallbackPath("/\\elsewhere.example"), "/");
  assert.equal(signInCallbackPath("javascript:alert(1)"), "/");
  assert.equal(signInCallbackPath(""), "/");
});
