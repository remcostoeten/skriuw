import assert from "node:assert/strict";
import test from "node:test";
import { closeHistory, history, redo, undo } from "prosemirror-history";
import { EditorState, NodeSelection, TextSelection, type Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  countWords,
  productSchema,
  serializeProductMarkdown,
} from "../../src/editor/schema";
import { extractReferences } from "../../src/references/extract";
import {
  acceptMentionItem,
  createMentionPlugin,
  dismissMention,
  handleMentionKey,
  mentionMenuItems,
  mentionState,
  moveMentionSelection,
  normalizedMentionIndex,
  type MentionContext,
} from "../../src/references/mention-plugin";
import { createInitialState, createRendererStore } from "../../src/store/store";
import type { RendererStore } from "../../src/store/types";
import { referenceFixture } from "./fixtures";

function fixtureStore(): RendererStore {
  const { snapshot, references } = referenceFixture();
  return createRendererStore(createInitialState(snapshot, undefined, references));
}

function createHarness(store: RendererStore = fixtureStore()) {
  const context: MentionContext = {
    getState: () => store.getState(),
    applyReferenceOperations: (operations) => {
      store.applyReferenceOperations(operations);
    },
  };
  let editorState = EditorState.create({
    doc: productSchema.node("doc", null, [productSchema.node("paragraph")]),
    plugins: [history(), createMentionPlugin(context)],
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
  const type = (text: string) => {
    for (const character of text) {
      view.dispatch(view.state.tr.insertText(character));
    }
  };
  return { view, context, store, type, state: () => editorState };
}

function keyEvent(key: string): KeyboardEvent {
  return { key } as KeyboardEvent;
}

test("typing a trigger opens transient completion state owned by the plugin", () => {
  const { view, type, state } = createHarness();
  type("see #al");
  assert.deepEqual(
    { active: true, trigger: "#", query: "al" },
    (({ active, trigger, query }) => ({ active, trigger, query }))(mentionState(state())),
  );
  type("p");
  assert.equal(mentionState(state()).query, "alp");
  view.dispatch(view.state.tr.insertText(" "));
  assert.equal(mentionState(state()).active, false);
});

test("triggers require a boundary and never fire inside words or code blocks", () => {
  const { type, state, view } = createHarness();
  type("email@example");
  assert.equal(mentionState(state()).active, false);
  const codeBlock = productSchema.nodes.code_block;
  assert.ok(codeBlock);
  view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, codeBlock.create()));
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)).insertText("#tag"),
  );
  assert.equal(mentionState(state()).active, false);
});

test("ordinary typing never notifies the renderer store", () => {
  const { type, store } = createHarness();
  let notifications = 0;
  store.subscribe(
    (state) => state,
    () => {
      notifications += 1;
    },
  );
  type("drafting #alpha and @ada while typing plain text");
  assert.equal(notifications, 0);
});

test("accepting a tag suggestion commits an atom with the stable identifier", () => {
  const { view, context, type, state } = createHarness();
  type("topic #alp");
  const items = mentionMenuItems(context.getState(), "#", "alp");
  assert.equal(items[0]?.type, "suggestion");
  assert.equal(acceptMentionItem(view, items[0]!, context), true);
  assert.equal(mentionState(state()).active, false);
  assert.deepEqual(extractReferences(state().doc.toJSON()), [
    { kind: "tag", targetId: "tag-alpha" },
  ]);
  assert.equal(state().doc.textContent.includes("#alp"), false);
});

test("keyboard navigation wraps and enter accepts the highlighted item", () => {
  const { view, context, type, state } = createHarness();
  type("with @");
  const items = mentionMenuItems(context.getState(), "@", "");
  assert.ok(items.length >= 2);
  assert.equal(handleMentionKey(view, keyEvent("ArrowDown"), context), true);
  assert.equal(normalizedMentionIndex(mentionState(state()).index, items.length), 1);
  moveMentionSelection(view, -2);
  assert.equal(
    normalizedMentionIndex(mentionState(state()).index, items.length),
    items.length - 1,
  );
  view.dispatch(view.state.tr.setMeta("noop", true));
  assert.equal(handleMentionKey(view, keyEvent("Enter"), context), true);
  assert.equal(extractReferences(state().doc.toJSON()).length, 1);
});

test("escape cancels completion, leaves plain text, and stays dismissed while extending", () => {
  const { view, context, type, state } = createHarness();
  type("plain #tag");
  assert.equal(handleMentionKey(view, keyEvent("Escape"), context), true);
  assert.equal(mentionState(state()).active, false);
  type("more");
  assert.equal(mentionState(state()).active, false);
  assert.equal(state().doc.textContent, "plain #tagmore");
});

test("deleting back past a dismissed trigger re-arms completion", () => {
  const { view, context, type, state } = createHarness();
  type("x #a");
  dismissMention(view);
  const paragraphEnd = view.state.selection.from;
  view.dispatch(view.state.tr.delete(paragraphEnd - 2, paragraphEnd));
  type("#a");
  assert.equal(mentionState(state()).active, true);
  assert.equal(handleMentionKey(view, keyEvent("Tab"), context), true);
});

test("selection, delete, undo, and redo round-trip committed tokens", () => {
  const { view, context, type, state } = createHarness();
  type("start @Ada");
  view.dispatch(closeHistory(view.state.tr));
  const items = mentionMenuItems(context.getState(), "@", "Ada");
  acceptMentionItem(view, items[0]!, context);
  assert.equal(extractReferences(state().doc.toJSON()).length, 1);

  assert.equal(undo(view.state, view.dispatch), true);
  assert.equal(extractReferences(state().doc.toJSON()).length, 0);
  assert.equal(state().doc.textContent, "start @Ada");
  assert.equal(redo(view.state, view.dispatch), true);
  assert.equal(extractReferences(state().doc.toJSON()).length, 1);

  let tokenPosition = -1;
  state().doc.descendants((node, position) => {
    if (node.type.name === "mention_ref") {
      tokenPosition = position;
    }
    return true;
  });
  assert.ok(tokenPosition >= 0);
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, tokenPosition)));
  view.dispatch(view.state.tr.deleteSelection());
  assert.equal(extractReferences(state().doc.toJSON()).length, 0);
});

test("creating a missing tag applies a reference operation and inserts the new token", () => {
  const { view, context, type, state, store } = createHarness();
  type("#brandnew");
  const items = mentionMenuItems(context.getState(), "#", "brandnew");
  const create = items.at(-1);
  assert.equal(create?.type, "create");
  acceptMentionItem(view, create!, context);
  const [reference] = extractReferences(state().doc.toJSON());
  assert.equal(reference?.kind, "tag");
  assert.equal(store.getState().tags.get(reference!.targetId)?.name, "brandnew");
});

test("mention menu items exclude exact duplicates from the create option", () => {
  const store = fixtureStore();
  const tagItems = mentionMenuItems(store.getState(), "#", "alpha");
  assert.equal(tagItems.some((item) => item.type === "create"), false);
  const personItems = mentionMenuItems(store.getState(), "@", "Ada");
  assert.equal(personItems.some((item) => item.type === "create"), false);
  assert.equal(
    mentionMenuItems(store.getState(), "@", "Adaline").some((item) => item.type === "create"),
    true,
  );
});

test("markdown serialization and word count treat tokens as labeled text", () => {
  const tagRef = productSchema.nodes.tag_ref;
  const mentionRef = productSchema.nodes.mention_ref;
  assert.ok(tagRef && mentionRef);
  const document = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, [
      productSchema.text("ship "),
      tagRef.create({ id: "tag-alpha", label: "alpha" }),
      productSchema.text(" with "),
      mentionRef.create({ kind: "person", id: "person-ada", label: "Ada" }),
    ]),
  ]);
  assert.equal(serializeProductMarkdown(document), "ship #alpha with @Ada");
  assert.equal(countWords(document), 2);
  const roundTripped = productSchema.nodeFromJSON(document.toJSON());
  assert.equal(roundTripped.eq(document), true);
});
