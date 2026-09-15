import assert from "node:assert/strict";
import test from "node:test";
import {
  registerAiSettings,
  requestAiSettings,
} from "../../../src/features/ai/ai-settings-controller";

test("a request reaches the mounted shell", () => {
  let opened = 0;
  const unregister = registerAiSettings(() => {
    opened += 1;
  });
  requestAiSettings();
  assert.equal(opened, 1);
  unregister();
});

test("a request without a shell is dropped, not replayed later", () => {
  requestAiSettings();
  let opened = 0;
  const unregister = registerAiSettings(() => {
    opened += 1;
  });
  assert.equal(opened, 0);
  unregister();
});

test("unregistering only clears its own listener, never a newer one", () => {
  let newer = 0;
  const stale = registerAiSettings(() => undefined);
  const current = registerAiSettings(() => {
    newer += 1;
  });
  stale();
  requestAiSettings();
  assert.equal(newer, 1);
  current();
});
