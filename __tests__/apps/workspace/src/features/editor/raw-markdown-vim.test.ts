import assert from "node:assert/strict";
import { test } from "vitest";
import { describeRawMarkdownVimFeedback } from "@/features/editor/raw-markdown-vim";

function feedback(
  keys: string[],
  before: string,
  after = before,
  selectionFrom = 0,
  selectionTo = 0,
  visualLine = false,
): string | null {
  return describeRawMarkdownVimFeedback({
    keys,
    before,
    after,
    selectionFrom,
    selectionTo,
    visualLine,
  });
}

test("raw Vim feedback describes counted line operators", () => {
  assert.equal(feedback(["3", "y", "y"], "one\ntwo\nthree\nfour"), "3 lines yanked");
  assert.equal(feedback(["2", "d", "d"], "one\ntwo\nthree", "three"), "2 lines deleted");
  assert.equal(feedback(["d", "2", "d"], "one\ntwo\nthree", "three"), "2 lines deleted");
  assert.equal(feedback([">", ">"], "one", "  one"), "1 line indented");
});

test("raw Vim feedback describes character and visual-line actions", () => {
  assert.equal(feedback(["3", "x"], "abcdef", "def"), "3 characters deleted");
  assert.equal(feedback(["y"], "one\ntwo\nthree", undefined, 0, 7, true), "2 lines yanked");
  assert.equal(feedback(["p"], "ac", "abc"), "1 character put");
});
