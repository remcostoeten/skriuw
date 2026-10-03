import assert from "node:assert/strict";
import { test } from "vitest";
import { EditorState, NodeSelection, TextSelection, type Plugin } from "prosemirror-state";
import type { DecorationSet } from "prosemirror-view";
import { caretBlockRange, createFocusDimPlugin } from "@/features/editor/focus/dim";
import { productSchema } from "@/features/editor/schema";

function documentWithList() {
  return productSchema.node("doc", null, [
    productSchema.node("paragraph", null, productSchema.text("intro")),
    productSchema.node("bullet_list", null, [
      productSchema.node("list_item", null, [
        productSchema.node("paragraph", null, productSchema.text("nested")),
      ]),
    ]),
    productSchema.node("paragraph", null, productSchema.text("outro")),
  ]);
}

function decorationsOf(plugin: Plugin, state: EditorState): DecorationSet | null {
  const decorations = plugin.props.decorations;
  assert.ok(decorations);
  return (decorations.call(plugin, state) as DecorationSet | null | undefined) ?? null;
}

test("the caret block is the top-level block, even deep inside a list", () => {
  const doc = documentWithList();
  const listStart = doc.child(0).nodeSize;
  const listEnd = listStart + doc.child(1).nodeSize;
  assert.deepEqual(caretBlockRange(doc, doc.resolve(2)), { from: 0, to: listStart });
  assert.deepEqual(caretBlockRange(doc, doc.resolve(listStart + 4)), {
    from: listStart,
    to: listEnd,
  });
});

test("a selection between blocks resolves to the block after it", () => {
  const doc = documentWithList();
  const listStart = doc.child(0).nodeSize;
  assert.deepEqual(caretBlockRange(doc, doc.resolve(listStart)), {
    from: listStart,
    to: listStart + doc.child(1).nodeSize,
  });
  assert.deepEqual(caretBlockRange(doc, doc.resolve(doc.content.size)), {
    from: doc.content.size - doc.child(2).nodeSize,
    to: doc.content.size,
  });
});

test("dimming decorates exactly the caret block and reuses it while the caret stays", () => {
  const plugin = createFocusDimPlugin(() => true);
  const state = EditorState.create({ doc: documentWithList(), plugins: [plugin] });
  const inList = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, state.doc.child(0).nodeSize + 4)),
  );
  const decorations = decorationsOf(plugin, inList);
  assert.ok(decorations);
  const found = decorations.find();
  assert.equal(found.length, 1);
  assert.equal(found[0]?.from, inList.doc.child(0).nodeSize);
  assert.equal(decorationsOf(plugin, inList), decorations);
  const selectedNode = inList.apply(inList.tr.setSelection(NodeSelection.create(inList.doc, 0)));
  assert.equal(decorationsOf(plugin, selectedNode)?.find()[0]?.from, 0);
});

test("dimming adds nothing while the setting is off", () => {
  let enabled = false;
  const plugin = createFocusDimPlugin(() => enabled);
  const state = EditorState.create({ doc: documentWithList(), plugins: [plugin] });
  assert.equal(decorationsOf(plugin, state), null);
  enabled = true;
  assert.equal(decorationsOf(plugin, state)?.find().length, 1);
});
