import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, TextSelection, type Transaction } from "prosemirror-state";
import {
  createProductPlugins,
  parseProductMarkdown,
  productSchema,
  serializeProductMarkdown,
} from "../../../src/features/editor/schema";

function stateFromMarkdown(markdown: string): EditorState {
  const state = EditorState.create({
    doc: parseProductMarkdown(markdown),
    plugins: createProductPlugins(),
  });
  return state.apply(
    state.tr.setSelection(
      TextSelection.near(state.doc.resolve(state.doc.content.size), -1),
    ),
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
  const event = { key: "Enter", keyCode: 13, shiftKey, ctrlKey: false, altKey: false, metaKey: false };
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

test("Enter on the empty line after a break starts a real paragraph", () => {
  const state = pressEnter(pressEnter(stateFromMarkdown("one")));
  assert.equal(state.doc.childCount, 2);
  assert.equal(state.doc.firstChild?.lastChild?.type.name, "text");
  assert.equal(state.doc.lastChild?.content.size, 0);
  assert.equal(state.selection.$from.parent, state.doc.lastChild);
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
