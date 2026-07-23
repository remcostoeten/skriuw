import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { EditorState, type Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { summarize } from "../../performance/metrics";
import { productSchema } from "../../src/editor/schema";
import { createMentionPlugin, type MentionContext } from "../../src/references/mention-plugin";
import {
  queryMentionSuggestions,
  queryTagSuggestions,
} from "../../src/references/suggestion-index";
import { projectBacklinks } from "../../src/references/reference-panel-model";
import { referenceKey, type StructuredReference } from "../../src/references/types";
import { createInitialState, createRendererStore } from "../../src/store/store";
import { largeReferenceFixture, referenceDocumentJson } from "./fixtures";

const SUGGESTION_P95_BUDGET_MS = 8;
const SUGGESTION_MAX_BUDGET_MS = 16.67;
const NOTE_SWITCH_COUNT = 100;

function largeStore() {
  const { snapshot, references } = largeReferenceFixture({
    noteCount: 5000,
    tagCount: 1000,
    personCount: 1000,
    referencesPerNote: 3,
  });
  return createRendererStore(createInitialState(snapshot, undefined, references));
}

test("suggestion open and filter stay inside the frame budget at workload scale", () => {
  const store = largeStore();
  const state = store.getState();
  const queries = ["", "t", "tag 0", "tag 0999", "zzz", "per", "person 0500", "note", "Note 04"];
  const samples: number[] = [];
  for (let round = 0; round < 15; round += 1) {
    for (const query of queries) {
      const start = performance.now();
      queryTagSuggestions(state, query);
      queryMentionSuggestions(state, query);
      samples.push(performance.now() - start);
    }
  }
  const summary = summarize(samples);
  assert.ok(
    summary.p95Ms < SUGGESTION_P95_BUDGET_MS,
    `suggestion p95 ${summary.p95Ms}ms exceeds ${SUGGESTION_P95_BUDGET_MS}ms`,
  );
  assert.ok(
    summary.maxMs < SUGGESTION_MAX_BUDGET_MS,
    `suggestion max ${summary.maxMs}ms exceeds ${SUGGESTION_MAX_BUDGET_MS}ms`,
  );
});

test("suggestion filtering never scans documents or crosses the bridge on keypress", () => {
  const store = largeStore();
  const state = store.getState();
  let reads = 0;
  const guardedState = {
    ...state,
    get documents(): never {
      reads += 1;
      throw new Error("suggestion filtering read documents");
    },
  };
  queryTagSuggestions(guardedState, "tag 05");
  queryMentionSuggestions(guardedState, "person 05");
  assert.equal(reads, 0);
});

test("cached note switches leave every reference projection identity untouched", () => {
  const store = largeStore();
  const before = store.getState();
  let referenceNotifications = 0;
  store.subscribe(
    (state) => state.outgoingReferences,
    () => {
      referenceNotifications += 1;
    },
  );
  store.subscribe(
    (state) => state.tags,
    () => {
      referenceNotifications += 1;
    },
  );
  for (let index = 1; index <= NOTE_SWITCH_COUNT; index += 1) {
    store.setActiveNote(`note-${index % 500}`);
  }
  const after = store.getState();
  assert.equal(referenceNotifications, 0);
  assert.equal(after.tags, before.tags);
  assert.equal(after.people, before.people);
  assert.equal(after.outgoingReferences, before.outgoingReferences);
  assert.equal(after.incomingReferences, before.incomingReferences);
  assert.equal(after.metadata, before.metadata);
});

test("typing with the mention plugin installed causes zero store notifications", () => {
  const store = largeStore();
  const context: MentionContext = {
    getState: () => store.getState(),
    applyReferenceOperations: (operations) => {
      store.applyReferenceOperations(operations);
    },
  };
  let notifications = 0;
  store.subscribe(
    (state) => state,
    () => {
      notifications += 1;
    },
  );
  let editorState = EditorState.create({
    doc: productSchema.node("doc", null, [productSchema.node("paragraph")]),
    plugins: [createMentionPlugin(context)],
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
  const samples: number[] = [];
  const text = "measuring #tag 0042 and @person plus plain prose ";
  for (let round = 0; round < 4; round += 1) {
    for (const character of text) {
      const start = performance.now();
      view.dispatch(view.state.tr.insertText(character));
      samples.push(performance.now() - start);
    }
  }
  assert.equal(notifications, 0);
  const summary = summarize(samples);
  assert.ok(
    summary.maxMs < SUGGESTION_MAX_BUDGET_MS,
    `keystroke max ${summary.maxMs}ms exceeds ${SUGGESTION_MAX_BUDGET_MS}ms`,
  );
});

test("high-reference documents save within the frame budget", () => {
  const store = largeStore();
  const highReferenceTargets: StructuredReference[] = Array.from({ length: 500 }, (_, index) => {
    const pick = index % 3;
    if (pick === 0) {
      return { kind: "tag", targetId: `tag-${index % 1000}` };
    }
    if (pick === 1) {
      return { kind: "person", targetId: `person-${index % 1000}` };
    }
    return { kind: "note", targetId: `note-${(index + 1) % 5000}` };
  });
  const samples: number[] = [];
  for (let round = 0; round < 20; round += 1) {
    const targets = round % 2 === 0 ? highReferenceTargets.slice(0, 400) : highReferenceTargets;
    const start = performance.now();
    store.applyOperations([
      {
        type: "save_document",
        noteId: "note-0",
        documentJson: referenceDocumentJson(targets),
        markdown: "",
        wordCount: 1,
        expectedRevision: 1,
        at: round,
      },
    ]);
    samples.push(performance.now() - start);
  }
  const state = store.getState();
  assert.equal(state.outgoingReferences.get("note-0")?.length, 500);
  assert.equal(
    state.incomingReferences.get(referenceKey("tag", "tag-0"))?.includes("note-0"),
    true,
  );
  assert.ok(projectBacklinks(state, "note-1").length > 0);
  const summary = summarize(samples);
  assert.ok(
    summary.maxMs < 50,
    `high-reference save max ${summary.maxMs}ms exceeds 50ms`,
  );
});
