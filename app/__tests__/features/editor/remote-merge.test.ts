import assert from "node:assert/strict";
import test from "node:test";
import { schema as basicSchema } from "prosemirror-schema-basic";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import {
  REMOTE_APPLY_META,
  applyRemoteDocument,
  blockChanges,
  blocksOf,
  buildRemoteTr,
  contentDiff,
  mergeDocuments,
} from "../../../src/features/editor/remote-merge";
import { productSchema } from "../../../src/features/editor/schema";

function p(text: string): ProseMirrorNode {
  return productSchema.node("paragraph", null, text ? [productSchema.text(text)] : []);
}

function h(text: string, level = 2): ProseMirrorNode {
  return productSchema.node("heading", { level }, [productSchema.text(text)]);
}

function code(text: string): ProseMirrorNode {
  return productSchema.node("code_block", null, [productSchema.text(text)]);
}

function list(...items: string[]): ProseMirrorNode {
  return productSchema.node(
    "bullet_list",
    null,
    items.map((item) => productSchema.node("list_item", null, [p(item)])),
  );
}

function table(rows: string[][]): ProseMirrorNode {
  return productSchema.node(
    "table",
    null,
    rows.map((cells, rowIndex) =>
      productSchema.node(
        "table_row",
        null,
        cells.map((cell) =>
          productSchema.node(rowIndex === 0 ? "table_header" : "table_cell", null, [p(cell)]),
        ),
      ),
    ),
  );
}

function doc(blocks: ProseMirrorNode[], attrs: Record<string, unknown> | null = null): ProseMirrorNode {
  return productSchema.node("doc", attrs, blocks);
}

function stateFor(document: ProseMirrorNode, caret?: number): EditorState {
  const state = EditorState.create({ doc: document });
  if (caret === undefined) return state;
  return state.apply(state.tr.setSelection(TextSelection.create(document, caret)));
}

function expectTransaction(state: EditorState, incoming: ProseMirrorNode) {
  const application = buildRemoteTr(state, incoming);
  assert.equal(application.kind, "transaction", `expected a transaction, got ${application.kind}`);
  if (application.kind !== "transaction") throw new Error("unreachable");
  const next = state.apply(application.tr);
  assert.ok(next.doc.eq(incoming), "the applied transaction must reproduce the incoming document");
  assert.equal(application.tr.getMeta("addToHistory"), false);
  assert.equal(application.tr.getMeta(REMOTE_APPLY_META), true);
  return { application, next };
}

test("contentDiff corrects a crossed prefix and suffix scan for repeated content", () => {
  const diff = contentDiff(doc([p("aa")]), doc([p("aaa")]));
  assert.deepEqual(diff, { start: 3, endA: 3, endB: 4 });
  const shrink = contentDiff(doc([p("aaa")]), doc([p("aa")]));
  assert.deepEqual(shrink, { start: 3, endA: 4, endB: 3 });
  assert.equal(contentDiff(doc([p("same")]), doc([p("same")])), null);
});

test("a repeated-character change applies as one validated ReplaceStep", () => {
  const { application } = expectTransaction(stateFor(doc([p("aa")]), 3), doc([p("aaa")]));
  assert.equal(application.strategy, "step");
});

test("an attrs-only change goes through attribute steps and leaves the content alone", () => {
  const before = doc([p("text")]);
  const state = stateFor(before, 3);
  const { application, next } = expectTransaction(state, doc([p("text")], { drawing: "{\"v\":1}" }));
  assert.equal(application.strategy, "attrs");
  assert.equal(next.doc.attrs.drawing, "{\"v\":1}");
  assert.equal(next.selection.head, 3);
  assert.equal(application.tr.steps.length, 1);
});

test("unchanged documents produce no transaction", () => {
  assert.deepEqual(buildRemoteTr(stateFor(doc([p("x")])), doc([p("x")])), { kind: "unchanged" });
});

test("table, list and code-block boundary changes apply and reproduce the incoming document", () => {
  const cases: [ProseMirrorNode, ProseMirrorNode][] = [
    [doc([p("intro"), table([["a", "b"], ["1", "2"]])]), doc([p("intro"), p("between"), table([["a", "b"], ["1", "2"]])])],
    [doc([table([["a", "b"], ["1", "2"]])]), doc([table([["a", "b"], ["1", "2"], ["3", "4"]])])],
    [doc([table([["a", "b"], ["1", "2"]])]), doc([table([["a", "b", "c"], ["1", "2", "3"]])])],
    [doc([table([["a"], ["1"]]), p("after")]), doc([p("after")])],
    [doc([list("one", "two")]), doc([list("one", "one and a half", "two")])],
    [doc([list("one", "two"), p("tail")]), doc([list("one"), p("tail")])],
    [doc([p("x"), list("a")]), doc([p("x"), list("a"), list("b")])],
    [doc([code("let a = 1;")]), doc([code("let a = 1;\nlet b = 2;")])],
    [doc([p("prose"), code("x")]), doc([p("prose"), p("more prose"), code("x")])],
    [doc([code("x"), p("tail")]), doc([p("x"), p("tail")])],
    [doc([p("a")]), doc([code("a")])],
    [doc([h("Title"), p("body")]), doc([h("Title", 1), p("body"), table([["k"], ["v"]])])],
  ];
  for (const [before, after] of cases) {
    const { application } = expectTransaction(stateFor(before, 1), after);
    assert.ok(["step", "depth0"].includes(application.strategy));
  }
});

test("a document no step can express is rebuilt with the caret kept in range", () => {
  const state = stateFor(doc([p("hello world")]), 5);
  const foreign = basicSchema.node("doc", null, [
    basicSchema.node("paragraph", null, [basicSchema.text("hi")]),
  ]) as unknown as ProseMirrorNode;
  assert.deepEqual(buildRemoteTr(state, foreign), { kind: "rebuild" });
  const applied = applyRemoteDocument(state, foreign, []);
  assert.equal(applied.strategy, "rebuild");
  assert.equal(applied.state.doc, foreign);
  assert.equal(applied.state.selection.head, 3);
});

test("a caret before the changed range stays put", () => {
  const before = doc([p("first"), p("second")]);
  const state = stateFor(before, 3);
  const { next } = expectTransaction(state, doc([p("first"), p("second edited")]));
  assert.equal(next.selection.head, 3);
});

test("a caret after the changed range shifts by the size delta", () => {
  const before = doc([p("first"), p("second")]);
  const state = stateFor(before, 10);
  const { next } = expectTransaction(state, doc([p("first one"), p("second")]));
  assert.equal(next.selection.head, 14);
  assert.equal(next.doc.textBetween(next.selection.head - 2, next.selection.head), "se");
});

test("a caret inside the changed range keeps its offset from the range start, clamped", () => {
  const before = doc([p("abcdefgh")]);
  const middle = stateFor(before, 5);
  const grown = expectTransaction(middle, doc([p("abXYZfgh")])).next;
  assert.equal(grown.selection.head, 5);
  const shrunk = expectTransaction(stateFor(before, 6), doc([p("abfgh")])).next;
  assert.equal(shrunk.selection.head, 3);
});

test("blockChanges aligns inserted, removed and edited blocks by equality", () => {
  const base = [p("a"), p("b"), p("c"), p("d")];
  const next = [p("a"), p("x"), p("c"), p("d"), p("e")];
  const regions = blockChanges(base, next);
  assert.equal(regions.length, 2);
  assert.deepEqual(
    regions.map((region) => [region.start, region.end, region.replacement.map((node) => node.textContent)]),
    [[1, 2, ["x"]], [4, 4, ["e"]]],
  );
  assert.deepEqual(
    blockChanges([p("a"), p("b"), p("c")], [p("a"), p("c")]).map((region) => [region.start, region.end]),
    [[1, 2]],
  );
  assert.deepEqual(blockChanges(blocksOf(doc([p("a")])), blocksOf(doc([p("a")]))), []);
});

test("dirty merge keeps a local edit and a remote edit to different blocks", () => {
  const base = doc([p("one"), p("two"), p("three")]);
  const local = doc([p("one local"), p("two"), p("three")]);
  const incoming = doc([p("one"), p("two"), p("three remote")]);
  const merged = mergeDocuments(base, local, incoming);
  assert.deepEqual(blocksOf(merged).map((block) => block.textContent), ["one local", "two", "three remote"]);
});

test("dirty merge keeps the local version of a block both sides changed", () => {
  const base = doc([p("one"), p("two"), p("three")]);
  const local = doc([p("one"), p("two local"), p("three")]);
  const incoming = doc([p("one"), p("two remote"), p("three")]);
  const merged = mergeDocuments(base, local, incoming);
  assert.deepEqual(blocksOf(merged).map((block) => block.textContent), ["one", "two local", "three"]);
});

test("dirty merge with several local regions still admits non-overlapping remote regions", () => {
  const base = doc([p("a"), p("b"), p("c"), p("d"), p("e")]);
  const local = doc([p("a local"), p("b"), p("c"), p("d"), p("e local"), p("f local")]);
  const incoming = doc([p("a"), p("b"), p("b2 remote"), p("c"), p("d remote"), p("e remote")]);
  const merged = mergeDocuments(base, local, incoming);
  assert.deepEqual(blocksOf(merged).map((block) => block.textContent), [
    "a local",
    "b",
    "b2 remote",
    "c",
    "d",
    "e local",
    "f local",
  ]);
});

test("dirty merge takes root attributes from whichever side changed them, local first", () => {
  const base = doc([p("x")], { drawing: null });
  const merged = mergeDocuments(base, doc([p("x local")], { drawing: null }), doc([p("x")], { drawing: "remote" }));
  assert.equal(merged.attrs.drawing, "remote");
  assert.equal(merged.firstChild?.textContent, "x local");
  const both = mergeDocuments(base, doc([p("x")], { drawing: "local" }), doc([p("x")], { drawing: "remote" }));
  assert.equal(both.attrs.drawing, "local");
});

test("a merged document applies through the remote transaction so history maps", () => {
  const base = doc([p("one"), p("two")]);
  const local = doc([p("one local"), p("two")]);
  const state = stateFor(local, 5);
  const merged = mergeDocuments(base, local, doc([p("one"), p("two remote")]));
  const { next } = expectTransaction(state, merged);
  assert.equal(next.selection.head, 5);
  assert.equal(next.doc.child(1).textContent, "two remote");
});
