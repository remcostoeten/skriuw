import assert from "node:assert/strict";
import { test } from "vitest";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import {
  EditorState,
  NodeSelection,
  TextSelection,
  type Command,
  type Transaction,
} from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  MATH_EDIT_EVENT,
  MATH_EDITING_CLASS,
  createMathEditingPlugin,
  editSelectedInlineMath,
  enterAdjacentMathBlock,
  exitMathBlock,
  insertInlineMath,
  insertMathBlock,
  mathBlockFromDollarFence,
} from "@/features/editor/math-commands";
import { createMentionPlugin, mentionState } from "@/features/references/mention-plugin";
import { filterSlashCommands } from "@/features/editor/slash-commands";
import { productSchema } from "@/features/editor/schema";
import { createInitialState, createRendererStore } from "@skriuw/renderer-core/store/store";
import { referenceFixture } from "../references/fixtures";

function doc(...blocks: ProseMirrorNode[]): ProseMirrorNode {
  return productSchema.node("doc", null, blocks);
}

function p(...content: (string | ProseMirrorNode)[]): ProseMirrorNode {
  return productSchema.node(
    "paragraph",
    null,
    content.map((item) => (typeof item === "string" ? productSchema.text(item) : item)),
  );
}

function mathBlock(tex: string): ProseMirrorNode {
  return productSchema.node("math_block", null, tex ? [productSchema.text(tex)] : []);
}

function hardBreak(): ProseMirrorNode {
  const node = productSchema.nodes.hard_break;
  assert.ok(node);
  return node.create();
}

function run(state: EditorState, command: Command, view?: EditorView): EditorState | null {
  let next: EditorState | null = null;
  const handled = command(
    state,
    (transaction: Transaction) => {
      next = state.apply(transaction);
    },
    view,
  );
  return handled ? (next ?? state) : null;
}

function at(document: ProseMirrorNode, pos: number): EditorState {
  return EditorState.create({ doc: document, selection: TextSelection.create(document, pos) });
}

function editEvents() {
  const events: { pos: number; type: string }[] = [];
  const view = {
    nodeDOM: (pos: number) => ({
      dispatchEvent: (event: Event) => {
        events.push({ pos, type: event.type });
        return true;
      },
    }),
    endOfTextblock: () => true,
  } as unknown as EditorView;
  return { view, events };
}

test("insertMathBlock replaces an empty paragraph and puts the caret in the source", () => {
  const next = run(at(doc(p("intro"), p()), 8), insertMathBlock);
  assert.ok(next);
  assert.equal(next.doc.childCount, 2);
  assert.equal(next.doc.child(1).type.name, "math_block");
  assert.equal(next.selection.$from.parent.type.name, "math_block");
});

test("insertMathBlock uses the selected text as TeX", () => {
  const document = doc(p("area is a^2 here"));
  const state = EditorState.create({
    doc: document,
    selection: TextSelection.create(document, 9, 12),
  });
  const next = run(state, insertMathBlock);
  assert.ok(next);
  const block = next.doc.child(1);
  assert.equal(block.type.name, "math_block");
  assert.equal(block.textContent, "a^2");
  assert.equal(next.selection.$from.parentOffset, 3);
});

test("insertInlineMath wraps the selected text as an inline formula", () => {
  const document = doc(p("so x^2 grows"));
  const state = EditorState.create({
    doc: document,
    selection: TextSelection.create(document, 4, 7),
  });
  const next = run(state, insertInlineMath);
  assert.ok(next);
  const node = next.doc.firstChild?.child(1);
  assert.equal(node?.type.name, "math_inline");
  assert.equal(node?.attrs.tex, "x^2");
  assert.ok(next.selection instanceof NodeSelection);
  assert.equal(next.doc.textContent, "so $x^2$ grows");
});

test("insertInlineMath with no selection inserts an empty formula and opens its editor", () => {
  const { view, events } = editEvents();
  const next = run(at(doc(p("ab")), 2), insertInlineMath, view);
  assert.ok(next);
  assert.equal(next.doc.firstChild?.child(1).type.name, "math_inline");
  assert.deepEqual(events, [{ pos: 2, type: MATH_EDIT_EVENT }]);
});

test("insertInlineMath refuses code blocks and math block sources", () => {
  const code = doc(productSchema.node("code_block", null, [productSchema.text("x")]));
  assert.equal(run(at(code, 1), insertInlineMath), null);
  assert.equal(run(at(doc(mathBlock("x")), 1), insertInlineMath), null);
});

test("Enter on a selected inline formula opens its editor", () => {
  const formula = productSchema.nodes.math_inline?.create({ tex: "x" });
  assert.ok(formula);
  const document = doc(p("a", formula, "b"));
  const state = EditorState.create({ doc: document, selection: NodeSelection.create(document, 2) });
  const { view, events } = editEvents();
  assert.ok(run(state, editSelectedInlineMath, view));
  assert.deepEqual(events, [{ pos: 2, type: MATH_EDIT_EVENT }]);
  assert.equal(run(at(document, 1), editSelectedInlineMath, view), null);
});

test("Enter on a line holding only $$ becomes a math block", () => {
  const next = run(at(doc(p("$$")), 3), mathBlockFromDollarFence);
  assert.ok(next);
  assert.equal(next.doc.firstChild?.type.name, "math_block");
  assert.equal(next.selection.$from.parent.type.name, "math_block");
});

test("$$ on the last line of a multi-line paragraph splits it off into a math block", () => {
  const document = doc(p("first line", hardBreak(), "$$"));
  const next = run(at(document, document.content.size - 1), mathBlockFromDollarFence);
  assert.ok(next);
  assert.equal(next.doc.childCount, 2);
  assert.equal(next.doc.child(0).textContent, "first line");
  assert.equal(next.doc.child(0).childCount, 1);
  assert.equal(next.doc.child(1).type.name, "math_block");
  assert.equal(next.selection.$from.parent.type.name, "math_block");
});

test("$$ elsewhere in a line is left to ordinary Enter", () => {
  assert.equal(run(at(doc(p("cost $$")), 8), mathBlockFromDollarFence), null);
  assert.equal(run(at(doc(p("$$ x")), 5), mathBlockFromDollarFence), null);
  assert.equal(run(at(doc(p("$$")), 1), mathBlockFromDollarFence), null);
});

test("typing $ still opens the people menu and $$ closes it before Enter", () => {
  const { snapshot, references } = referenceFixture();
  const store = createRendererStore(createInitialState(snapshot, undefined, references));
  let state = EditorState.create({
    doc: doc(p()),
    plugins: [
      createMentionPlugin({
        getState: () => store.getState(),
        applyReferenceOperations: () => {},
        createNote: () => {},
      }),
    ],
  });
  state = state.apply(state.tr.insertText("$"));
  assert.equal(mentionState(state).active, true);
  assert.equal(mentionState(state).trigger, "$");
  state = state.apply(state.tr.insertText("$"));
  assert.equal(mentionState(state).active, false);
  const next = run(state, mathBlockFromDollarFence);
  assert.equal(next?.doc.firstChild?.type.name, "math_block");
});

test("arrow keys at a textblock edge step into the adjacent math block source", () => {
  const document = doc(p("ab"), mathBlock("x^2"), p("cd"));
  const right = run(at(document, 3), enterAdjacentMathBlock("right"));
  assert.ok(right);
  assert.equal(right.selection.$from.parent.type.name, "math_block");
  assert.equal(right.selection.$from.parentOffset, 0);

  const left = run(at(document, 10), enterAdjacentMathBlock("left"));
  assert.ok(left);
  assert.equal(left.selection.$from.parent.type.name, "math_block");
  assert.equal(left.selection.$from.parentOffset, 3);

  const { view } = editEvents();
  const down = run(at(document, 2), enterAdjacentMathBlock("down"), view);
  assert.equal(down?.selection.$from.parentOffset, 0);
  const up = run(at(document, 10), enterAdjacentMathBlock("up"), view);
  assert.equal(up?.selection.$from.parentOffset, 3);
});

test("arrow keys away from an edge or next to ordinary blocks are not taken", () => {
  const document = doc(p("ab"), mathBlock("x"), p("cd"), p("ef"));
  assert.equal(run(at(document, 2), enterAdjacentMathBlock("right")), null);
  assert.equal(run(at(document, 10), enterAdjacentMathBlock("right")), null);
  assert.equal(run(at(document, 3), enterAdjacentMathBlock("down")), null);
});

test("Escape in a math block returns the caret to the text after it", () => {
  const document = doc(mathBlock("x"), p("after"));
  const next = run(at(document, 2), exitMathBlock);
  assert.ok(next);
  assert.equal(next.selection.$from.parent.textContent, "after");
  assert.equal(next.selection.$from.parentOffset, 0);
});

test("Escape in a final math block adds a paragraph to return to", () => {
  const next = run(at(doc(mathBlock("x")), 2), exitMathBlock);
  assert.ok(next);
  assert.equal(next.doc.childCount, 2);
  assert.equal(next.selection.$from.parent.type.name, "paragraph");
  assert.equal(run(at(doc(p("x")), 1), exitMathBlock), null);
});

test("only the math block holding the caret is decorated as editing", () => {
  const document = doc(mathBlock("a"), mathBlock("b"));
  const plugin = createMathEditingPlugin();
  const state = EditorState.create({
    doc: document,
    plugins: [plugin],
    selection: TextSelection.create(document, 5),
  });
  const decorations = plugin.props.decorations?.call(plugin, state);
  assert.ok(decorations);
  const found = decorations.find();
  assert.equal(found.length, 1);
  assert.equal(found[0]?.from, 3);
  assert.equal(
    (found[0] as unknown as { type: { attrs: { class: string } } }).type.attrs.class,
    MATH_EDITING_CLASS,
  );
  const outside = EditorState.create({ doc: doc(p("x")), plugins: [plugin] });
  assert.equal(plugin.props.decorations?.call(plugin, outside), null);
});

test("the slash menu offers math under /math and inline math under /inline", () => {
  assert.equal(filterSlashCommands("math")[0]?.id, "math-block");
  assert.ok(filterSlashCommands("math").some((command) => command.id === "inline-math"));
  assert.equal(filterSlashCommands("inline")[0]?.id, "inline-math");
  assert.equal(filterSlashCommands("latex")[0]?.id, "math-block");
});
