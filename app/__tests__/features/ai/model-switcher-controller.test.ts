import assert from "node:assert/strict";
import test from "node:test";
import {
  registerModelSwitcher,
  requestModelSwitcher,
} from "../../../src/features/ai/model-switcher-controller";

test("a request made before the host mounts replays exactly once on register", () => {
  requestModelSwitcher();
  let opened = 0;
  const unregister = registerModelSwitcher(() => {
    opened += 1;
  });
  assert.equal(opened, 1);

  unregister();
  const secondUnregister = registerModelSwitcher(() => {
    opened += 1;
  });
  assert.equal(opened, 1);
  secondUnregister();
});

test("a request with a mounted host fires immediately without queueing", () => {
  let opened = 0;
  const unregister = registerModelSwitcher(() => {
    opened += 1;
  });
  requestModelSwitcher();
  assert.equal(opened, 1);

  unregister();
  const drain = registerModelSwitcher(() => {
    opened += 1;
  });
  assert.equal(opened, 1);
  drain();
});

test("unregistering only clears its own listener, never a newer one", () => {
  let staleCalls = 0;
  let currentCalls = 0;
  const unregisterStale = registerModelSwitcher(() => {
    staleCalls += 1;
  });
  const unregisterCurrent = registerModelSwitcher(() => {
    currentCalls += 1;
  });

  unregisterStale();
  requestModelSwitcher();
  assert.equal(staleCalls, 0);
  assert.equal(currentCalls, 1);

  unregisterCurrent();
});
