import assert from "node:assert/strict";
import test from "node:test";
import { isDocEmpty, productSchema } from "../../../src/features/editor/schema";

test("a single empty paragraph counts as an empty document", () => {
  const doc = productSchema.nodeFromJSON({
    type: "doc",
    content: [{ type: "paragraph" }],
  });
  assert.equal(isDocEmpty(doc), true);
});

test("text, extra blocks, and non-paragraph blocks are not empty", () => {
  const withText = productSchema.nodeFromJSON({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
  });
  assert.equal(isDocEmpty(withText), false);
  const twoParagraphs = productSchema.nodeFromJSON({
    type: "doc",
    content: [{ type: "paragraph" }, { type: "paragraph" }],
  });
  assert.equal(isDocEmpty(twoParagraphs), false);
  const headingOnly = productSchema.nodeFromJSON({
    type: "doc",
    content: [{ type: "heading", attrs: { level: 1 } }],
  });
  assert.equal(isDocEmpty(headingOnly), false);
});
