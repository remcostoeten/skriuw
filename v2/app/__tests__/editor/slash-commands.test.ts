import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  applySlashCommand,
  filterSlashCommands,
  slashCommands,
} from "../../src/editor/slash-commands";
import { productSchema } from "../../src/editor/schema";

test("slashCommands defines expected set of editor command blocks", () => {
  const ids = slashCommands.map((item) => item.id);
  assert.ok(ids.includes("text"));
  assert.ok(ids.includes("heading-1"));
  assert.ok(ids.includes("heading-2"));
  assert.ok(ids.includes("heading-3"));
  assert.ok(ids.includes("bullet-list"));
  assert.ok(ids.includes("ordered-list"));
  assert.ok(ids.includes("quote"));
  assert.ok(ids.includes("code"));
});

test("filterSlashCommands filters by label or id case-insensitively", () => {
  const headings = filterSlashCommands("heading");
  assert.equal(headings.length, 3);
  assert.deepEqual(
    headings.map((h) => h.id),
    ["heading-1", "heading-2", "heading-3"],
  );

  const lists = filterSlashCommands("list");
  assert.equal(lists.length, 2);

  const empty = filterSlashCommands("nonexistent-command-query");
  assert.equal(empty.length, 0);
});

test("applySlashCommand converts slash trigger text into target node type", () => {
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, productSchema.text("/head")),
  ]);
  let state = EditorState.create({ doc, schema: productSchema });

  let focused = false;
  const mockView = {
    get state() {
      return state;
    },
    dispatch: (tr: any) => {
      state = state.apply(tr);
    },
    focus: () => {
      focused = true;
    },
  } as unknown as EditorView;

  const headingCmd = slashCommands.find((c) => c.id === "heading-1");
  assert.ok(headingCmd);
  applySlashCommand(mockView, headingCmd);

  assert.equal(state.doc.firstChild?.type.name, "heading");
  assert.equal(state.doc.firstChild?.attrs.level, 1);
  assert.equal(focused, true);
});
