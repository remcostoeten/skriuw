import assert from "node:assert/strict";
import test from "node:test";
import {
  openEditorSearch,
  registerEditorSearchController,
} from "../../src/editor/search-controller";

test("editor search commands target the current controller and clean up by identity", () => {
  let firstCalls = 0;
  let secondCalls = 0;
  const unregisterFirst = registerEditorSearchController({
    open: () => {
      firstCalls += 1;
    },
  });
  openEditorSearch();
  assert.equal(firstCalls, 1);

  const unregisterSecond = registerEditorSearchController({
    open: () => {
      secondCalls += 1;
    },
  });
  unregisterFirst();
  openEditorSearch();
  assert.equal(firstCalls, 1);
  assert.equal(secondCalls, 1);

  unregisterSecond();
  openEditorSearch();
  assert.equal(secondCalls, 1);
});
