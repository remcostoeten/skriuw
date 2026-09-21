import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "prosemirror-state";
import type { DecorationSet } from "prosemirror-view";
import {
  createSuggestionPlugin,
  setSuggestionPreview,
  suggestionPluginKey,
  type SuggestionPreview,
} from "../../../src/features/editor/suggestion-decorations";
import { productSchema } from "../../../src/features/editor/schema";

function stateWith(text: string): EditorState {
  return EditorState.create({
    schema: productSchema,
    doc: productSchema.node("doc", null, [
      productSchema.node("paragraph", null, productSchema.text(text)),
    ]),
    plugins: [createSuggestionPlugin()],
  });
}

function fakeHost(): HTMLElement {
  return { nodeName: "DIV" } as unknown as HTMLElement;
}

function preview(overrides: Partial<SuggestionPreview> = {}): SuggestionPreview {
  return {
    key: "session",
    from: 1,
    to: 6,
    host: fakeHost(),
    settled: false,
    onDismiss: () => {},
    ...overrides,
  };
}

/** Mirrors the editor's dispatch loop closely enough to drive the plugin. */
function pushed(state: EditorState, next: SuggestionPreview | null): EditorState {
  let current = state;
  setSuggestionPreview(
    {
      get state() {
        return current;
      },
      dispatch: (transaction) => {
        current = current.apply(transaction);
      },
    },
    next,
  );
  return current;
}

function decorations(state: EditorState) {
  const plugin = state.plugins.find((candidate) => candidate.spec.key === suggestionPluginKey);
  assert.ok(plugin);
  const set = plugin.props.decorations?.call(plugin, state) as DecorationSet;
  return set.find();
}

type Found = ReturnType<typeof decorations>[number];

function rangeClass(found: readonly Found[]): string | null {
  const painted = found.find(
    (decoration) => typeof decoration.type.attrs?.class === "string",
  );
  return painted === undefined ? null : String(painted.type.attrs.class);
}

test("a preview paints the range it would replace and a card after its block", () => {
  const found = decorations(pushed(stateWith("hello world"), preview()));
  assert.equal(found.length, 2);
  const painted = found.find((decoration) => decoration.from !== decoration.to);
  assert.equal(painted?.from, 1);
  assert.equal(painted?.to, 6);
  const widget = found.find((decoration) => decoration.from === decoration.to);
  assert.equal(widget?.from, 13, "the card sits after the paragraph, not inside it");
});

test("the range is only struck through once the run has settled", () => {
  const pending = rangeClass(decorations(pushed(stateWith("hello world"), preview())));
  const settled = rangeClass(
    decorations(pushed(stateWith("hello world"), preview({ settled: true }))),
  );
  assert.match(String(pending), /skriuw-suggestion-range$/);
  assert.match(String(settled), /--settled/);
});

test("an empty range shows the card without claiming any text is going away", () => {
  const state = pushed(stateWith("hello world"), preview({ from: 6, to: 6 }));
  assert.equal(decorations(state).length, 1);
});

test("editing the note dismisses the preview, because the result no longer fits", () => {
  let dismissed = 0;
  const state = pushed(
    stateWith("hello world"),
    preview({ onDismiss: () => (dismissed += 1) }),
  );
  const edited = state.apply(state.tr.insertText("!", 1));
  assert.equal(suggestionPluginKey.getState(edited)?.preview, null);
  assert.equal(decorations(edited).length, 0);
  assert.equal(dismissed, 0, "the plugin view fires the callback, not the reducer");
});

test("a selection change leaves the preview standing", () => {
  const state = pushed(stateWith("hello world"), preview());
  const moved = state.apply(state.tr.setMeta("pointer", true));
  assert.equal(suggestionPluginKey.getState(moved)?.preview?.key, "session");
});

test("reviewing never joins the undo stack", () => {
  let addToHistory: unknown = "unset";
  const state = stateWith("hello world");
  setSuggestionPreview(
    {
      state,
      dispatch: (transaction) => {
        addToHistory = transaction.getMeta("addToHistory");
      },
    },
    preview(),
  );
  assert.equal(addToHistory, false);
});
