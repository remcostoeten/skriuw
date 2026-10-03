import assert from "node:assert/strict";
import { test } from "vitest";
import { EditorState } from "prosemirror-state";
import type { DecorationSet } from "prosemirror-view";
import {
  createSuggestionPlugin,
  setSuggestionPreview,
  suggestionPluginKey,
  type SuggestionPreview,
} from "@/features/editor/suggestions/decorations";
import { productSchema } from "@/features/editor/schema";

function stateWith(text: string): EditorState {
  return EditorState.create({
    schema: productSchema,
    doc: productSchema.node("doc", null, [
      productSchema.node("paragraph", null, productSchema.text(text)),
    ]),
    plugins: [createSuggestionPlugin()],
  });
}

function preview(overrides: Partial<SuggestionPreview> = {}): SuggestionPreview {
  return {
    key: "session",
    from: 1,
    to: 6,
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
  const painted = found.find((decoration) => typeof decoration.type.attrs?.class === "string");
  return painted === undefined ? null : String(painted.type.attrs.class);
}

test("a preview paints only the range it would replace, never a card in the note", () => {
  const found = decorations(pushed(stateWith("hello world"), preview()));
  assert.equal(found.length, 1);
  assert.equal(found[0]?.from, 1);
  assert.equal(found[0]?.to, 6);
});

test("the range is only struck through once the run has settled", () => {
  const pending = rangeClass(decorations(pushed(stateWith("hello world"), preview())));
  const settled = rangeClass(
    decorations(pushed(stateWith("hello world"), preview({ settled: true }))),
  );
  assert.match(String(pending), /skriuw-suggestion-range$/);
  assert.match(String(settled), /--settled/);
});

test("an empty range paints nothing, so no text is claimed to be going away", () => {
  const state = pushed(stateWith("hello world"), preview({ from: 6, to: 6 }));
  assert.equal(decorations(state).length, 0);
  assert.equal(suggestionPluginKey.getState(state)?.preview?.key, "session");
});

test("editing the note dismisses the preview, because the result no longer fits", () => {
  let dismissed = 0;
  const state = pushed(stateWith("hello world"), preview({ onDismiss: () => (dismissed += 1) }));
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
