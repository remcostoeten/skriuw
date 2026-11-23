import assert from "node:assert/strict";
import { test } from "vitest";
import { EditorState, TextSelection, type Transaction } from "prosemirror-state";
import {
  createProductPlugins,
  parseProductMarkdown,
  productSchema,
  serializeProductMarkdown,
} from "@/features/editor/schema";

function stateFromMarkdown(markdown: string): EditorState {
  const state = EditorState.create({
    doc: parseProductMarkdown(markdown),
    plugins: createProductPlugins(),
  });
  return state.apply(
    state.tr.setSelection(TextSelection.near(state.doc.resolve(state.doc.content.size), -1)),
  );
}

function pressEnter(state: EditorState, shiftKey = false): EditorState {
  let current = state;
  const view = {
    get state() {
      return current;
    },
    dispatch(transaction: Transaction) {
      current = current.apply(transaction);
    },
  };
  const event = {
    key: "Enter",
    keyCode: 13,
    shiftKey,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
  };
  for (const plugin of current.plugins) {
    if (plugin.props.handleKeyDown?.(view as never, event as never)) break;
  }
  return current;
}

function roundTrip(markdown: string): string {
  return serializeProductMarkdown(parseProductMarkdown(markdown));
}

test("Enter in a paragraph adds a line break instead of a new paragraph", () => {
  const state = pressEnter(stateFromMarkdown("one"));
  assert.equal(state.doc.childCount, 1);
  assert.equal(state.doc.firstChild?.lastChild?.type.name, "hard_break");
  assert.equal(serializeProductMarkdown(state.doc), "one");
});

test("a line break serializes as a plain newline and parses back", () => {
  const state = pressEnter(stateFromMarkdown("one"));
  const typed = state.apply(state.tr.insertText("two", state.selection.from));
  assert.equal(serializeProductMarkdown(typed.doc), "one\ntwo");
  assert.equal(typed.doc.childCount, 1);

  const reparsed = parseProductMarkdown("one\ntwo");
  assert.equal(reparsed.childCount, 1);
  assert.equal(reparsed.firstChild?.childCount, 3);
  assert.equal(reparsed.firstChild?.child(1).type.name, "hard_break");
});

test("every Enter on an empty line adds another line break", () => {
  let state = stateFromMarkdown("one");
  for (let presses = 1; presses <= 4; presses += 1) {
    state = pressEnter(state);
    assert.equal(state.doc.childCount, 1);
    assert.equal(state.doc.firstChild?.childCount, presses + 1);
  }
});

test("Enter in an empty document moves the caret down a full line each time", () => {
  let state = EditorState.create({
    doc: productSchema.node("doc", null, [productSchema.node("paragraph")]),
    plugins: createProductPlugins(),
  });
  for (let presses = 1; presses <= 3; presses += 1) {
    state = pressEnter(state);
    assert.equal(state.doc.childCount, 1);
    assert.equal(state.doc.firstChild?.childCount, presses);
  }
});

test("Shift+Enter starts a new paragraph directly", () => {
  const state = pressEnter(stateFromMarkdown("one"), true);
  assert.equal(state.doc.childCount, 2);
  assert.equal(state.doc.lastChild?.content.size, 0);
});

test("Enter still splits list items", () => {
  const state = pressEnter(stateFromMarkdown("- one"));
  const list = state.doc.firstChild;
  assert.equal(list?.type.name, "bullet_list");
  assert.equal(list?.childCount, 2);
});

test("Enter still splits check items", () => {
  const state = pressEnter(stateFromMarkdown("- [ ] one"));
  const list = state.doc.firstChild;
  assert.equal(list?.type.name, "check_list");
  assert.equal(list?.childCount, 2);
});

test("Enter at the end of a heading still leaves the heading intact", () => {
  const state = pressEnter(stateFromMarkdown("# one"));
  assert.equal(state.doc.firstChild?.type.name, "heading");
  assert.equal(state.doc.childCount, 2);
});

test("a heading does not add a source-only blank line before its body", () => {
  const document = parseProductMarkdown("# one\n\ntwo\nthree");
  assert.equal(serializeProductMarkdown(document), "# one\ntwo\nthree");
  assert.deepEqual(parseProductMarkdown("# one\ntwo\nthree").toJSON(), document.toJSON());
});

test("line breaks survive repeated Markdown round trips", () => {
  for (const markdown of [
    "# one\n\ntwo\nthree\nfour",
    "a\n\\\n\\\nb",
    "\\\nleading break",
    "> quoted\n> lines",
  ]) {
    const once = roundTrip(markdown);
    assert.equal(roundTrip(once), once, markdown);
  }
});

test("consecutive breaks stay inside one paragraph across a round trip", () => {
  const paragraph = productSchema.node("paragraph", null, [
    productSchema.text("a"),
    productSchema.node("hard_break"),
    productSchema.node("hard_break"),
    productSchema.text("b"),
  ]);
  const markdown = serializeProductMarkdown(productSchema.node("doc", null, [paragraph]));
  const parsed = parseProductMarkdown(markdown);
  assert.equal(parsed.childCount, 1);
  assert.equal(parsed.firstChild?.childCount, 4);
  assert.equal(parsed.firstChild?.child(1).type.name, "hard_break");
  assert.equal(parsed.firstChild?.child(2).type.name, "hard_break");
});

test("Enter in a code block nested in a list item adds a newline to the code", () => {
  const markdown = "- item\n\n  ```ts\n  const a = 1\n  ```";
  const doc = parseProductMarkdown(markdown);
  const initial = EditorState.create({ doc, plugins: createProductPlugins() });
  let codePos = -1;
  doc.descendants((node, pos) => {
    if (node.type.name === "code_block") codePos = pos;
  });
  const end = codePos + 1 + doc.nodeAt(codePos)!.content.size;
  const placed = initial.apply(initial.tr.setSelection(TextSelection.create(initial.doc, end)));
  for (const shiftKey of [false, true]) {
    const state = pressEnter(placed, shiftKey);
    const items = state.doc.firstChild?.childCount;
    assert.equal(items, 1);
    assert.equal(state.doc.nodeAt(codePos)?.textContent, "const a = 1\n");
  }
});
