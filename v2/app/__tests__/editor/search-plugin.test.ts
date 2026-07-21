import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, type Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  buildRegex,
  createSearchPlugin,
  defaultSearchOptions,
  getSearchState,
  nextMatch,
  previousMatch,
  replaceAll,
  replaceCurrent,
  setSearch,
} from "../../src/editor/search-plugin";
import { productSchema } from "../../src/editor/schema";

function createView(lines: readonly string[]): { view: EditorView; state: () => EditorState } {
  let editorState = EditorState.create({
    doc: productSchema.node(
      "doc",
      null,
      lines.map((line) => productSchema.node("paragraph", null, productSchema.text(line))),
    ),
    plugins: [createSearchPlugin()],
  });
  const view = {
    get state() {
      return editorState;
    },
    dispatch(transaction: Transaction) {
      editorState = editorState.apply(transaction);
    },
    focus() {},
  } as unknown as EditorView;
  return { view, state: () => editorState };
}

test("search supports case, whole-word, regex, and invalid-regex states", () => {
  const { view } = createView(["Alpha beta alphabet", "alpha BETA"]);
  setSearch(view, "alpha", defaultSearchOptions);
  assert.equal(getSearchState(view)?.matches.length, 3);

  setSearch(view, "alpha", { ...defaultSearchOptions, wholeWord: true });
  assert.equal(getSearchState(view)?.matches.length, 2);

  setSearch(view, "Alpha", {
    ...defaultSearchOptions,
    wholeWord: true,
    caseSensitive: true,
  });
  assert.equal(getSearchState(view)?.matches.length, 1);

  setSearch(view, "b.ta", { ...defaultSearchOptions, regex: true });
  assert.equal(getSearchState(view)?.matches.length, 2);
  assert.equal(buildRegex("[", { ...defaultSearchOptions, regex: true }), null);
  setSearch(view, "[", { ...defaultSearchOptions, regex: true });
  assert.equal(getSearchState(view)?.matches.length, 0);
});

test("search navigation wraps in both directions", () => {
  const { view } = createView(["one two one"]);
  setSearch(view, "one", defaultSearchOptions);
  assert.equal(getSearchState(view)?.current, 0);
  nextMatch(view);
  assert.equal(getSearchState(view)?.current, 1);
  nextMatch(view);
  assert.equal(getSearchState(view)?.current, 0);
  previousMatch(view);
  assert.equal(getSearchState(view)?.current, 1);
});

test("replace current and replace all update the canonical editor document", () => {
  const { view, state } = createView(["one two one", "TWO"]);
  setSearch(view, "one", defaultSearchOptions);
  replaceCurrent(view, "first");
  assert.equal(state().doc.textBetween(0, state().doc.content.size, "\n"), "first two one\nTWO");
  assert.equal(getSearchState(view)?.matches.length, 1);

  setSearch(view, "two", defaultSearchOptions);
  replaceAll(view, "second");
  assert.equal(
    state().doc.textBetween(0, state().doc.content.size, "\n"),
    "first second one\nsecond",
  );
  assert.equal(getSearchState(view)?.matches.length, 0);
});
