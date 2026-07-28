import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  applySlashCommand,
  filterEmojiCommands,
  filterSlashCommands,
  filterSlashItems,
  slashCommands,
} from "../../src/editor/slash-commands";
import { productSchema } from "../../src/editor/schema";

test("slashCommands defines expected set of editor command blocks", () => {
  const ids = slashCommands.map((item) => item.id);
  assert.ok(ids.includes("text"));
  for (const level of [1, 2, 3, 4, 5, 6]) {
    assert.ok(ids.includes(`heading-${level}`));
  }
  for (const level of [1, 2, 3]) {
    assert.ok(ids.includes(`toggle-heading-${level}`));
  }
  assert.ok(ids.includes("bullet-list"));
  assert.ok(ids.includes("ordered-list"));
  assert.ok(ids.includes("check-list"));
  assert.ok(ids.includes("toggle-list"));
  assert.ok(ids.includes("quote"));
  assert.ok(ids.includes("code"));
  assert.ok(ids.includes("emoji"));
  assert.ok(ids.includes("image"));
  assert.ok(ids.includes("video"));
  assert.ok(ids.includes("audio"));
  assert.ok(ids.includes("file"));
});

test("filterSlashCommands filters by label or id case-insensitively", () => {
  const headings = filterSlashCommands("heading");
  assert.deepEqual(
    headings.map((h) => h.id),
    [
      "heading-1",
      "heading-2",
      "heading-3",
      "heading-4",
      "heading-5",
      "heading-6",
      "toggle-heading-1",
      "toggle-heading-2",
      "toggle-heading-3",
    ],
  );

  const lists = filterSlashCommands("list");
  assert.equal(lists.length, 4);

  const empty = filterSlashCommands("nonexistent-command-query");
  assert.equal(empty.length, 0);
});

test("heading aliases resolve every level", () => {
  for (const level of [1, 2, 3, 4, 5, 6]) {
    assert.equal(filterSlashCommands(`h${level}`)[0]?.id, `heading-${level}`);
  }
  assert.equal(filterSlashCommands("th2")[0]?.id, "toggle-heading-2");
});

test("the emoji trigger searches emoji instead of block commands", () => {
  const byShortcode = filterEmojiCommands("rocket");
  assert.equal(byShortcode[0]?.icon, "🚀");
  assert.equal(byShortcode[0]?.subtext, ":rocket:");

  const byKeyword = filterEmojiCommands("celebrate");
  assert.ok(byKeyword.some((item) => item.icon === "🎉"));

  assert.equal(filterSlashItems(":", "rocket")[0]?.icon, "🚀");
  assert.equal(filterSlashItems("/", "quote")[0]?.id, "quote");
  assert.equal(filterEmojiCommands("nonexistent-emoji-query").length, 0);
});

test("the emoji menu caps how many results it offers", () => {
  assert.ok(filterEmojiCommands("").length <= 60);
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

test("the emoji command inserts its character over the trigger text", () => {
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, productSchema.text("ship it :rocket")),
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

  const rocket = filterEmojiCommands("rocket")[0];
  assert.ok(rocket);
  assert.equal(applySlashCommand(mockView, rocket, ":"), null);
  assert.equal(state.doc.firstChild?.textContent, "ship it 🚀");
});

test("the emoji block command defers opening the picker to the host", () => {
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, productSchema.text("/emoji")),
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

  const emoji = slashCommands.find((c) => c.id === "emoji");
  assert.ok(emoji);
  assert.equal(applySlashCommand(mockView, emoji), "open-emoji");
  assert.equal(state.doc.firstChild?.textContent, "");
});

test("a toggle heading command wraps the block and keeps a real heading summary", () => {
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, productSchema.text("Roadmap /th2")),
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

  const command = slashCommands.find((c) => c.id === "toggle-heading-2");
  assert.ok(command);
  applySlashCommand(mockView, command);

  const list = state.doc.firstChild;
  assert.equal(list?.type.name, "toggle_list");
  const item = list?.firstChild;
  assert.equal(item?.type.name, "toggle_item");
  assert.equal(item?.firstChild?.type.name, "heading");
  assert.equal(item?.firstChild?.attrs.level, 2);
  assert.equal(item?.firstChild?.textContent.trim(), "Roadmap");
});

test("a toggle heading command retypes the summary of an existing toggle item", () => {
  const doc = productSchema.node("doc", null, [
    productSchema.node("toggle_list", null, [
      productSchema.node("toggle_item", null, [
        productSchema.node("paragraph", null, productSchema.text("Summary /th3")),
      ]),
    ]),
  ]);
  let state = EditorState.create({ doc, schema: productSchema });
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, state.doc.content.size - 3)),
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

  const command = slashCommands.find((c) => c.id === "toggle-heading-3");
  assert.ok(command);
  applySlashCommand(mockView, command);

  assert.equal(state.doc.childCount, 1);
  const summary = state.doc.firstChild?.firstChild?.firstChild;
  assert.equal(summary?.type.name, "heading");
  assert.equal(summary?.attrs.level, 3);
});

test("media commands insert an empty embed and select it", () => {
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, productSchema.text("/video")),
  ]);
  let state = EditorState.create({ doc, schema: productSchema });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 7)));

  const mockView = {
    get state() {
      return state;
    },
    dispatch: (tr: any) => {
      state = state.apply(tr);
    },
    focus: () => undefined,
  } as unknown as EditorView;

  const video = slashCommands.find((c) => c.id === "video");
  assert.ok(video);
  applySlashCommand(mockView, video);

  const media = state.doc.firstChild;
  assert.equal(media?.type.name, "media");
  assert.equal(media?.attrs.kind, "video");
  assert.equal(media?.attrs.src, "");
  assert.ok(state.selection instanceof NodeSelection);
  assert.equal((state.selection as NodeSelection).node.type.name, "media");
  assert.equal(state.doc.lastChild?.type.name, "paragraph");
});
