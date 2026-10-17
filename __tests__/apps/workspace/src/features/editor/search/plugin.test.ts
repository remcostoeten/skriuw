import assert from "node:assert/strict";
import { test } from "vitest";
import { EditorState, type Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  buildRegex,
  createSearchPlugin,
  defaultSearchOptions,
  findSearchMatches,
  getSearchState,
  nextMatch,
  previousMatch,
  replaceAll,
  replaceCurrent,
  setSearch,
  type SearchOptions,
} from "@/features/editor/search/plugin";
import { productSchema } from "@/features/editor/schema";

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

function edit(view: EditorView, build: (transaction: Transaction) => Transaction): void {
  view.dispatch(build(view.state.tr));
}

function assertMatchesFullSearch(view: EditorView, term: string, options: SearchOptions): void {
  const state = getSearchState(view);
  assert.ok(state);
  assert.deepEqual(state.matches, findSearchMatches(view.state.doc, buildRegex(term, options)));
}

test("typing in a paragraph without the term keeps the same matches", () => {
  const { view } = createView(["alpha one", "beta two one"]);
  setSearch(view, "one", defaultSearchOptions);
  edit(view, (transaction) => transaction.insertText("x", 13));

  assert.equal(getSearchState(view)?.matches.length, 2);
  assertMatchesFullSearch(view, "one", defaultSearchOptions);
});

test("typing that completes the term adds a match", () => {
  const { view } = createView(["alpha on", "beta one"]);
  setSearch(view, "one", defaultSearchOptions);
  edit(view, (transaction) => transaction.insertText("e", 9));

  assert.equal(getSearchState(view)?.matches.length, 2);
  assertMatchesFullSearch(view, "one", defaultSearchOptions);
});

test("deleting a character inside a match drops it and keeps current in range", () => {
  const { view } = createView(["one two one", "one"]);
  setSearch(view, "one", defaultSearchOptions);
  nextMatch(view);
  nextMatch(view);
  assert.equal(getSearchState(view)?.current, 2);
  edit(view, (transaction) => transaction.delete(15, 16));

  const state = getSearchState(view);
  assert.equal(state?.matches.length, 2);
  assert.ok(state && state.current >= 0 && state.current <= state.matches.length - 1);
  assertMatchesFullSearch(view, "one", defaultSearchOptions);
});

test("splitting a paragraph inside a match removes it", () => {
  const { view } = createView(["alpha one beta", "one"]);
  setSearch(view, "one", defaultSearchOptions);
  edit(view, (transaction) => transaction.split(8));

  assert.equal(getSearchState(view)?.matches.length, 1);
  assertMatchesFullSearch(view, "one", defaultSearchOptions);
});

test("joining two paragraphs forms a match across the old boundary", () => {
  const { view } = createView(["alpha on", "e beta", "one"]);
  setSearch(view, "one", defaultSearchOptions);
  assert.equal(getSearchState(view)?.matches.length, 1);
  edit(view, (transaction) => transaction.join(10));

  assert.equal(getSearchState(view)?.matches.length, 2);
  assertMatchesFullSearch(view, "one", defaultSearchOptions);
});

test("whole-word matches follow an edit next to a match", () => {
  const options = { ...defaultSearchOptions, wholeWord: true };
  const { view } = createView(["one oneself one", "one"]);
  setSearch(view, "one", options);
  assert.equal(getSearchState(view)?.matches.length, 3);
  edit(view, (transaction) => transaction.insertText("s", 4));

  assert.equal(getSearchState(view)?.matches.length, 2);
  assertMatchesFullSearch(view, "one", options);
});

test("a regex term is searched across the whole document after an edit", () => {
  const options = { ...defaultSearchOptions, regex: true };
  const { view } = createView(["alpha betz", "gamma"]);
  setSearch(view, "a\\ng", options);
  assert.equal(getSearchState(view)?.matches.length, 0);
  edit(view, (transaction) => transaction.insertText("a", 10, 11));

  assert.equal(getSearchState(view)?.matches.length, 1);
  assertMatchesFullSearch(view, "a\\ng", options);
});
