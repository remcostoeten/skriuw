import assert from "node:assert/strict";
import { test } from "vitest";
import { haptic } from "@/shared/lib/haptics";

test("haptic is a no-op without a vibration API and vibrates with one", () => {
  const original = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
  assert.doesNotThrow(() => haptic("select"));
  const calls: unknown[] = [];
  Object.defineProperty(globalThis, "navigator", {
    value: { vibrate: (pattern: unknown) => calls.push(pattern) },
    configurable: true,
  });
  haptic("warn");
  assert.deepEqual(calls, [[10, 40, 10]]);
  haptic("select");
  assert.deepEqual(calls[1], [8]);
  Object.defineProperty(globalThis, "navigator", { value: original, configurable: true });
});
