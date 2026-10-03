import assert from "node:assert/strict";
import { test } from "vitest";
import { accountLifecycle, bindAccountLifecycle } from "@/features/auth/account-lifecycle";

test("the bound lifecycle receives account changes until it is unbound", async () => {
  const calls: string[] = [];
  const unbind = bindAccountLifecycle({
    flushPendingWork: async () => {
      calls.push("flush");
    },
    signedIn: () => calls.push("signed in"),
    signedOut: () => calls.push("signed out"),
  });

  await accountLifecycle().flushPendingWork();
  accountLifecycle().signedIn();
  accountLifecycle().signedOut();
  unbind();
  await accountLifecycle().flushPendingWork();
  accountLifecycle().signedIn();
  accountLifecycle().signedOut();

  assert.deepEqual(calls, ["flush", "signed in", "signed out"]);
});

test("unbinding a replaced lifecycle keeps the newer binding", () => {
  const calls: string[] = [];
  const unbindFirst = bindAccountLifecycle({
    flushPendingWork: () => Promise.resolve(),
    signedIn: () => calls.push("first"),
    signedOut: () => undefined,
  });
  const unbindSecond = bindAccountLifecycle({
    flushPendingWork: () => Promise.resolve(),
    signedIn: () => calls.push("second"),
    signedOut: () => undefined,
  });

  unbindFirst();
  accountLifecycle().signedIn();
  unbindSecond();

  assert.deepEqual(calls, ["second"]);
});
