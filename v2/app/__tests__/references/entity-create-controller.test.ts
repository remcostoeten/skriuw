import assert from "node:assert/strict";
import test from "node:test";
import {
  registerEntityCreate,
  requestEntityCreate,
} from "../../src/references/entity-create-controller";

test("requestEntityCreate invokes registered listener immediately", () => {
  let invoked = false;
  const unbind = registerEntityCreate("note", () => {
    invoked = true;
  });

  requestEntityCreate("note");
  assert.equal(invoked, true);

  unbind();
});

test("requestEntityCreate queues request when listener registered later", () => {
  let invoked = false;
  requestEntityCreate("person");

  const unbind = registerEntityCreate("person", () => {
    invoked = true;
  });

  assert.equal(invoked, true);
  unbind();
});

test("registerEntityCreate unbind stops listener calls", () => {
  let calls = 0;
  const unbind = registerEntityCreate("tag", () => {
    calls += 1;
  });

  requestEntityCreate("tag");
  assert.equal(calls, 1);

  unbind();
  requestEntityCreate("tag");
  assert.equal(calls, 1);
});
