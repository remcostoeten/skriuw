import assert from "node:assert/strict";
import test from "node:test";

import { undoDepth } from "prosemirror-history";
import { EditorState, TextSelection } from "prosemirror-state";

import {
  createProductPlugins,
  createRepresentativeProductDocument,
  productSchema,
  serializeProductMarkdown,
  slashMenuState,
} from "./prosemirror-product.ts";

test("representative schema preserves structured Markdown blocks and marks", () => {
  const document = createRepresentativeProductDocument();
  const nodeTypes: string[] = [];
  const markTypes: string[] = [];
  document.descendants((node) => {
    nodeTypes.push(node.type.name);
    markTypes.push(...node.marks.map((mark) => mark.type.name));
  });
  assert.deepEqual(
    new Set(nodeTypes),
    new Set([
      "heading",
      "text",
      "paragraph",
      "bullet_list",
      "list_item",
      "ordered_list",
      "blockquote",
      "code_block",
      "horizontal_rule",
    ]),
  );
  assert.deepEqual(new Set(markTypes), new Set(["strong", "em", "code", "link"]));
  const markdown = serializeProductMarkdown(document);
  assert.match(markdown, /^# Representative note/m);
  assert.match(markdown, /\*\*Strong\*\*/);
  assert.match(markdown, /\[link\]\(https:\/\/example\.com\)/);
  assert.match(markdown, /^\* Bullet item/m);
  assert.match(markdown, /^3\. Ordered item/m);
  assert.match(markdown, /^> Quoted text/m);
  assert.match(markdown, /```\nconst ready = true;\n```/);
  assert.match(markdown, /^---$/m);
});

test("representative plugins track slash state and bounded undo", () => {
  const paragraph = productSchema.node("paragraph");
  const document = productSchema.node("doc", null, [paragraph]);
  let state = EditorState.create({ doc: document, plugins: createProductPlugins() });
  state = state.apply(
    state.tr
      .setSelection(TextSelection.create(state.doc, 1))
      .insertText("/heading"),
  );
  assert.deepEqual(slashMenuState(state), { open: true, query: "heading" });
  assert.equal(undoDepth(state), 1);
});
