import assert from "node:assert/strict";
import test from "node:test";
import { noop } from "../../src/shared/lib/noop";
import {
  openEditorSearch,
  openEditorSearchAndReplace,
  registerEditorSearchController,
} from "../../src/editor/search-controller";

test("editor search commands target the current controller and clean up by identity", () => {
  let firstCalls = 0;
  let secondCalls = 0;
  const unregisterFirst = registerEditorSearchController({
    open: () => {
      firstCalls += 1;
    },
    openReplace: noop,
  });
  openEditorSearch();
  assert.equal(firstCalls, 1);

  const unregisterSecond = registerEditorSearchController({
    open: () => {
      secondCalls += 1;
    },
    openReplace: noop,
  });
  unregisterFirst();
  openEditorSearch();
  assert.equal(firstCalls, 1);
  assert.equal(secondCalls, 1);

  unregisterSecond();
  openEditorSearch();
  assert.equal(secondCalls, 1);
});

test("find and find-and-replace reach separate entry points on the same controller", () => {
  const calls: string[] = [];
  const unregister = registerEditorSearchController({
    open: () => calls.push("find"),
    openReplace: () => calls.push("replace"),
  });

  openEditorSearchAndReplace();
  openEditorSearch();
  assert.deepEqual(calls, ["replace", "find"]);

  unregister();
  openEditorSearchAndReplace();
  assert.deepEqual(calls, ["replace", "find"]);
});
