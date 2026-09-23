import assert from "node:assert/strict";
import { test } from "vitest";
import { PULL_CLOSE_PX, pullCloses, pullOffset } from "@/shared/ui/dialog-pull";

test("a dialog follows a downward pull and ignores an upward one", () => {
  assert.equal(pullOffset(40), 40);
  assert.equal(pullOffset(-40), 0);
});

test("a pull past the threshold closes, a shorter one settles back", () => {
  assert.equal(pullCloses(PULL_CLOSE_PX - 1), false);
  assert.equal(pullCloses(PULL_CLOSE_PX), true);
  assert.equal(pullCloses(-PULL_CLOSE_PX), false);
});
