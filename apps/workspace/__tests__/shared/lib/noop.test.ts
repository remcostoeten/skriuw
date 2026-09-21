import assert from "node:assert/strict";
import test from "node:test";
import { noop } from "../../../src/shared/lib/noop";

test("noop returns undefined and does not throw", () => {
  assert.equal(noop(), undefined);
});
