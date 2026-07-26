import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, TextSelection } from "prosemirror-state";
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
  assert.ok(ids.includes("check-list"));
  assert.ok(ids.includes("toggle-list"));
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
  assert.equal(lists.length, 4);

  const empty = filterSlashCommands("nonexistent-command-query");
  assert.equal(empty.length, 0);
});

test("filterSlashCommands matches aliases and ranks prefix matches first", () => {
  assert.equal(filterSlashCommands("h1")[0]?.id, "heading-1");
  assert.equal(filterSlashCommands("ul")[0]?.id, "bullet-list");
  assert.equal(filterSlashCommands("hr")[0]?.id, "divider");
  assert.equal(filterSlashCommands("todo")[0]?.id, "check-list");
  assert.equal(filterSlashCommands("collapse")[0]?.id, "toggle-list");
  assert.equal(filterSlashCommands("code")[0]?.id, "code");
});

test("applySlashCommand only removes the slash trigger, not preceding text", () => {
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, productSchema.text("keep this /div")),
  ]);
  let state = EditorState.create({ doc, schema: productSchema });
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, state.doc.content.size - 1)),
  );

  const mockView = {
    get state() {
      return state;
    },
    dispatch: (tr: any) => {
      state = state.apply(tr);
    },
    focus: () => undefined,
  } as unknown as EditorView;

  const divider = slashCommands.find((c) => c.id === "divider");
  assert.ok(divider);
  applySlashCommand(mockView, divider);

  assert.equal(state.doc.firstChild?.textContent, "keep this ");
});

test("the image command clears its trigger and defers to the host action", () => {
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, productSchema.text("before /image")),
  ]);
  let state = EditorState.create({ doc, schema: productSchema });
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, state.doc.content.size - 1)),
  );

  const mockView = {
    get state() {
      return state;
    },
    dispatch: (tr: any) => {
      state = state.apply(tr);
    },
    focus: () => undefined,
  } as unknown as EditorView;

  const image = slashCommands.find((c) => c.id === "image");
  assert.ok(image);
  const action = applySlashCommand(mockView, image);

  assert.equal(action, "insert-image");
  assert.equal(state.doc.firstChild?.textContent, "before ");
  assert.equal(state.doc.childCount, 1);
});

test("applySlashCommand returns no action for commands that run inline", () => {
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, productSchema.text("/quote")),
  ]);
  let state = EditorState.create({ doc, schema: productSchema });
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, state.doc.content.size - 1)),
  );

  const mockView = {
    get state() {
      return state;
    },
    dispatch: (tr: any) => {
      state = state.apply(tr);
    },
    focus: () => undefined,
  } as unknown as EditorView;

  const quote = slashCommands.find((c) => c.id === "quote");
  assert.ok(quote);
  assert.equal(applySlashCommand(mockView, quote), null);
  assert.equal(state.doc.firstChild?.type.name, "blockquote");
});

test("the divider command leaves a paragraph after a trailing rule", () => {
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, productSchema.text("/div")),
  ]);
  let state = EditorState.create({ doc, schema: productSchema });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 5)));

  const mockView = {
    get state() {
      return state;
    },
    dispatch: (tr: any) => {
      state = state.apply(tr);
    },
    focus: () => undefined,
  } as unknown as EditorView;

  const divider = slashCommands.find((c) => c.id === "divider");
  assert.ok(divider);
  applySlashCommand(mockView, divider);

  const last = state.doc.lastChild;
  assert.equal(state.doc.child(state.doc.childCount - 2)?.type.name, "horizontal_rule");
  assert.equal(last?.type.name, "paragraph");
  assert.equal(last?.childCount, 0);
  assert.equal(state.selection.$from.parent.type.name, "paragraph");
  assert.equal(state.selection.from, state.doc.content.size - 1);
});

test("the divider command reuses the following block instead of adding one", () => {
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, productSchema.text("/div")),
    productSchema.node("paragraph", null, productSchema.text("after")),
  ]);
  let state = EditorState.create({ doc, schema: productSchema });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 5)));

  const mockView = {
    get state() {
      return state;
    },
    dispatch: (tr: any) => {
      state = state.apply(tr);
    },
    focus: () => undefined,
  } as unknown as EditorView;

  const divider = slashCommands.find((c) => c.id === "divider");
  assert.ok(divider);
  applySlashCommand(mockView, divider);

  assert.equal(state.doc.childCount, 2);
  assert.equal(state.doc.child(0).type.name, "horizontal_rule");
  assert.equal(state.doc.child(1).textContent, "after");
  assert.equal(state.selection.$from.parent.textContent, "after");
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
