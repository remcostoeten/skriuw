import assert from "node:assert/strict";
import { test } from "vitest";

import {
  createSkriuwPlatform,
  QUICK_ACTION_EVENT,
  type NativeLaunchTiming,
  type NativeSkriuwPlatform,
} from "../../../../../apps/mobile/modules/skriuw-platform/src/platform";

function fakeNative(timing: NativeLaunchTiming, pending: string | null = null) {
  const listeners = new Set<(event: { type: string }) => void>();
  let queued = pending;
  const native: NativeSkriuwPlatform = {
    takeQuickAction() {
      const type = queued;
      queued = null;
      return type;
    },
    launchTiming: () => timing,
    addListener(eventName, listener) {
      assert.equal(eventName, QUICK_ACTION_EVENT);
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  };
  return { native, listeners };
}

test("a build without the native module reports no quick action and no timing", () => {
  const platform = createSkriuwPlatform(null);

  assert.equal(platform.takeQuickAction(), null);
  assert.equal(platform.launchTiming(), null);
  platform.subscribeQuickActions(() => assert.fail("nothing can be delivered"))();
});

test("the pending quick action is handed over once", () => {
  const platform = createSkriuwPlatform(
    fakeNative({ elapsedMs: 1, anchor: "process-start" }, "search").native,
  );

  assert.equal(platform.takeQuickAction(), "search");
  assert.equal(platform.takeQuickAction(), null);
});

test("a running app hears quick actions until it unsubscribes", () => {
  const { native, listeners } = fakeNative({ elapsedMs: 1, anchor: "process-start" });
  const platform = createSkriuwPlatform(native);
  const heard: string[] = [];

  const stop = platform.subscribeQuickActions((type) => heard.push(type));
  for (const listener of listeners) listener({ type: "capture" });
  stop();

  assert.deepEqual(heard, ["capture"]);
  assert.equal(listeners.size, 0);
});

test("launch timing is parsed at the boundary and refused when malformed", () => {
  function timing(native: NativeLaunchTiming) {
    return createSkriuwPlatform(fakeNative(native).native).launchTiming();
  }

  assert.deepEqual(timing({ elapsedMs: 912.5, anchor: "process-start" }), {
    elapsedMs: 912.5,
    anchor: "process-start",
  });
  assert.deepEqual(timing({ elapsedMs: 640, anchor: "app-launch" }), {
    elapsedMs: 640,
    anchor: "app-launch",
  });
  assert.equal(timing({ elapsedMs: 640, anchor: "boot" }), null);
  assert.equal(timing({ elapsedMs: -1, anchor: "process-start" }), null);
  assert.equal(timing({ elapsedMs: Number.NaN, anchor: "process-start" }), null);
});
