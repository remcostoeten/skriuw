import assert from "node:assert/strict";
import { test } from "vitest";
import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import {
  applySlashCommand,
  filterEmojiCommands,
  filterSlashCommands,
  filterSlashItems,
  slashCommands,
} from "@/features/editor/slash-commands";
import { productSchema } from "@/features/editor/schema";
import { mermaidTemplates } from "@/features/editor/mermaid-render";

test("slashCommands offers the block commands no other test reaches by id", () => {
  const ids = slashCommands.map((item) => item.id);
  for (const id of ["text", "ordered-list", "check-list", "audio", "file"]) {
    assert.ok(ids.includes(id), id);
  }
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
  for (const level of [1, 2, 3, 4, 5, 6]) {
    assert.equal(filterSlashCommands(`h${level}`)[0]?.id, `heading-${level}`);
  }
  assert.equal(filterSlashCommands("th2")[0]?.id, "toggle-heading-2");
  assert.equal(filterSlashCommands("ul")[0]?.id, "bullet-list");
  assert.equal(filterSlashCommands("hr")[0]?.id, "divider");
  assert.equal(filterSlashCommands("todo")[0]?.id, "task");
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

  assert.equal(action, "pick-image");
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

test("the diagram command inserts a selectable diagram and trailing paragraph", () => {
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, productSchema.text("/diagram")),
  ]);
  let state = EditorState.create({ doc, schema: productSchema });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 9)));
  const mockView = {
    get state() {
      return state;
    },
    dispatch: (tr: any) => {
      state = state.apply(tr);
    },
    focus: () => undefined,
  } as unknown as EditorView;
  const diagram = slashCommands.find((command) => command.id === "diagram");
  assert.ok(diagram);
  applySlashCommand(mockView, diagram);
  assert.equal(state.doc.child(0).type.name, "diagram");
  assert.equal(state.doc.child(1).type.name, "paragraph");
  assert.ok(state.selection instanceof NodeSelection);
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

test("the video command clears its trigger and defers to the asset picker", () => {
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
  const action = applySlashCommand(mockView, video);

  assert.equal(action, "pick-video");
  assert.equal(state.doc.firstChild?.type.name, "paragraph");
  assert.equal(state.doc.firstChild?.textContent, "");
});

test("the mermaid family commands insert a source-mode mermaid fence with the caret on the first token", () => {
  for (const template of mermaidTemplates) {
    const doc = productSchema.node("doc", null, [
      productSchema.node("paragraph", null, productSchema.text("/seq")),
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
    const command = slashCommands.find((c) => c.id === template.id);
    assert.ok(command, template.id);
    assert.equal(applySlashCommand(mockView, command), null);
    const block = state.doc.firstChild;
    assert.equal(block?.type.name, "code_block", template.id);
    assert.equal(block?.attrs.params, "mermaid");
    assert.equal(block?.textContent, template.source);
    assert.equal(state.doc.lastChild?.type.name, "paragraph");
    assert.equal(state.selection.from, 1 + template.caret);
    assert.equal(
      state.doc.textBetween(state.selection.from, state.selection.from + 4),
      template.source.slice(template.caret, template.caret + 4),
    );
  }
});

test("family aliases resolve to the mermaid fence commands", () => {
  assert.equal(filterSlashCommands("sequence")[0]?.id, "sequence-diagram");
  assert.equal(filterSlashCommands("state")[0]?.id, "state-diagram");
  assert.equal(filterSlashCommands("class")[0]?.id, "class-diagram");
  assert.equal(filterSlashCommands("er")[0]?.id, "er-diagram");
});

function firstTable(doc: ProseMirrorNode): ProseMirrorNode {
  const table = doc.child(0);
  assert.equal(table.type.name, "table");
  return table;
}

function stateWithParagraph(text: string, trailing?: string): EditorState {
  const blocks = [productSchema.node("paragraph", null, productSchema.text(text))];
  if (trailing !== undefined) {
    blocks.push(productSchema.node("paragraph", null, productSchema.text(trailing)));
  }
  const doc = productSchema.node("doc", null, blocks);
  const state = EditorState.create({ doc, schema: productSchema });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1 + text.length)));
}

function runSlashCommand(id: string, initial: EditorState): EditorState {
  let state = initial;
  const view = {
    get state() {
      return state;
    },
    dispatch: (transaction: never) => {
      state = state.apply(transaction);
    },
    focus: () => undefined,
  } as unknown as EditorView;
  const command = slashCommands.find((entry) => entry.id === id);
  assert.ok(command);
  applySlashCommand(view, command);
  return state;
}

test("the table slash command inserts a 3x3 table with a header row", () => {
  const state = runSlashCommand("table", stateWithParagraph("/table"));
  const table = firstTable(state.doc);

  assert.equal(table.childCount, 3);
  table.forEach((row) => assert.equal(row.childCount, 3));
  table.child(0).forEach((cell) => assert.equal(cell.type.name, "table_header"));
  table.child(1).forEach((cell) => assert.equal(cell.type.name, "table_cell"));
});

test("the table slash command puts the cursor in the first header cell", () => {
  const state = runSlashCommand("table", stateWithParagraph("/table"));
  const { $from } = state.selection;

  assert.equal($from.node($from.depth - 1).type.name, "table_header");
  assert.equal($from.node($from.depth - 2).type.name, "table_row");
  assert.equal(state.doc.lastChild?.type.name, "paragraph");
});

test("the table slash command reuses a following block instead of adding one", () => {
  const state = runSlashCommand("table", stateWithParagraph("/table", "after"));

  assert.equal(state.doc.childCount, 2);
  assert.equal(state.doc.child(0).type.name, "table");
  assert.equal(state.doc.child(1).textContent, "after");
});
