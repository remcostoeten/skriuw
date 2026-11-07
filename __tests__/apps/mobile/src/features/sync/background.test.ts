import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createBackgroundRefreshSlot,
  describeBackgroundStrategy,
} from "@/features/sync/background";

const NEVER = new Promise<void>(() => undefined);

test("a task in a process without an open workspace skips instead of opening one", async () => {
  const slot = createBackgroundRefreshSlot();

  assert.deepEqual(await slot.run(NEVER), { kind: "skipped" });
});

test("a task runs the refresh the mounted runtime offers, until it is withdrawn", async () => {
  const slot = createBackgroundRefreshSlot();
  let refreshes = 0;
  const withdraw = slot.provide(async () => {
    refreshes += 1;
  });

  assert.deepEqual(await slot.run(NEVER), { kind: "completed" });
  withdraw();
  assert.deepEqual(await slot.run(NEVER), { kind: "skipped" });
  assert.equal(refreshes, 1);
});

test("withdrawing a replaced refresh leaves the newer one in place", async () => {
  const slot = createBackgroundRefreshSlot();
  const withdrawFirst = slot.provide(async () => undefined);
  slot.provide(async () => {
    throw new Error("the second runtime ran");
  });

  withdrawFirst();

  assert.deepEqual(await slot.run(NEVER), { kind: "failed", message: "the second runtime ran" });
});

test("the copy promises a scheduled refresh on iOS only, and no background notifications", () => {
  const ios = describeBackgroundStrategy("ios");
  const android = describeBackgroundStrategy("android");

  function guarantee(entries: typeof ios, trigger: string) {
    return entries.find((entry) => entry.trigger === trigger)?.guarantee;
  }

  assert.equal(guarantee(ios, "scheduled-task"), "best-effort");
  assert.equal(guarantee(android, "scheduled-task"), "unavailable");
  assert.equal(guarantee(ios, "silent-push"), "unavailable");
  assert.equal(guarantee(android, "silent-push"), "unavailable");
});
