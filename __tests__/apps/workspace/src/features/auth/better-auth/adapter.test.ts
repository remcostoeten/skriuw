import assert from "node:assert/strict";
import { test } from "vitest";
import { bindAccountLifecycle } from "@/features/auth/account-lifecycle";
import { leaveSignedOutWorkspace, signInCallbackPath } from "@/features/auth/better-auth/adapter";

test("signing out stores pending edits before leaving the account workspace", async () => {
  const calls: string[] = [];
  const unbind = bindAccountLifecycle({
    flushPendingWork: async () => {
      calls.push("flush");
    },
    signedIn: () => undefined,
    signedOut: () => undefined,
  });

  await leaveSignedOutWorkspace(async () => {
    calls.push("leave");
  });
  unbind();

  assert.deepEqual(calls, ["flush", "leave"]);
});

test("edits that cannot be stored keep the window on the account workspace", async () => {
  let left = false;
  const unbind = bindAccountLifecycle({
    flushPendingWork: () => Promise.reject(new Error("disk full")),
    signedIn: () => undefined,
    signedOut: () => undefined,
  });

  await leaveSignedOutWorkspace(async () => {
    left = true;
  });
  unbind();

  assert.equal(left, false);
});

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
