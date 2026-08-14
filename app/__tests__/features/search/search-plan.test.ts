import assert from "node:assert/strict";
import test from "node:test";
import type { SearchHit, WorkspaceSnapshot } from "../../../src/contracts/workspace";
import { JOURNAL_ROOT_ID } from "../../../src/features/journal/constants";
import type { NoteReferences, ReferenceBootstrap } from "../../../src/features/references/types";
import { applySearchPlan, planWorkspaceSearch } from "../../../src/features/search/search-plan";
import { createInitialState, createRendererStore } from "../../../src/store/store";
import type { RendererStore } from "../../../src/store/types";
import {
  fixtureNode,
  fixtureSettings,
  largeReferenceFixture,
  person,
  referenceDocumentJson,
  tag,
} from "../references/fixtures";

const LIMIT = 8;

type NoteSpec = {
  id: string;
  title: string;
  markdown?: string;
  parentId?: string | null;
  deletedAt?: number | null;
  targets?: NoteReferences["targets"];
};

function buildStore(notes: readonly NoteSpec[]): RendererStore {
  const references: NoteReferences[] = [];
  const snapshot: WorkspaceSnapshot = {
    protocolVersion: 1,
    activeNoteId: null,
    nodes: [
      fixtureNode({ id: JOURNAL_ROOT_ID, kind: "folder", rank: 1, title: "Journal" }),
      ...notes.map((note, index) =>
        fixtureNode({
          id: note.id,
          kind: "note",
          rank: 100 + index,
          title: note.title,
          parentId: note.parentId ?? null,
          deletedAt: note.deletedAt ?? null,
        }),
      ),
    ],
    documents: notes.map((note) => ({
      noteId: note.id,
      documentJson: referenceDocumentJson(note.targets ?? [], note.markdown ?? "body"),
      markdown: note.markdown ?? "body",
      revision: 1,
      wordCount: 1,
    })),
    historyHeaders: [],
    settings: fixtureSettings(),
  };
  for (const note of notes) {
    if (note.targets && note.targets.length > 0) {
      references.push({ noteId: note.id, targets: note.targets });
    }
  }
  const bootstrap: ReferenceBootstrap = {
    tags: [tag("tag-design", "design"), tag("tag-ops", "ops")],
    people: [person("person-ada", "Ada")],
    references,
  };
  return createRendererStore(createInitialState(snapshot, undefined, bootstrap));
}

function fixtureStore(): RendererStore {
  return buildStore([
    {
      id: "note-both",
      title: "Launch plan",
      markdown: "budget and timeline",
      targets: [
        { kind: "tag", targetId: "tag-design" },
        { kind: "person", targetId: "person-ada" },
      ],
    },
    {
      id: "note-tag-only",
      title: "Design notes",
      markdown: "budget only",
      targets: [{ kind: "tag", targetId: "tag-design" }],
    },
    {
      id: "note-person-only",
      title: "Ada sync",
      markdown: "budget only",
      targets: [{ kind: "person", targetId: "person-ada" }],
    },
    { id: "note-plain", title: "Loose note", markdown: "budget only" },
    {
      id: "note-trashed",
      title: "Trashed design",
      deletedAt: 5,
      targets: [{ kind: "tag", targetId: "tag-design" }],
    },
    {
      id: "note-journal",
      title: "2026-08-14",
      parentId: JOURNAL_ROOT_ID,
      markdown: "budget review",
      targets: [{ kind: "tag", targetId: "tag-design" }],
    },
  ]);
}

function hitsFor(ids: readonly string[]): SearchHit[] {
  return ids.map((noteId, index) => ({
    noteId,
    title: noteId,
    snippet: "",
    score: index,
  }));
}

function resultIds(store: RendererStore, query: string, hits: readonly SearchHit[]): string[] {
  const state = store.getState();
  const plan = planWorkspaceSearch(state, query, LIMIT);
  return applySearchPlan(state, plan, hits, LIMIT).map((hit) => hit.noteId);
}

test("an unfiltered query passes full-text hits through untouched", () => {
  const store = fixtureStore();
  const plan = planWorkspaceSearch(store.getState(), "budget", LIMIT);
  assert.equal(plan.status, "ready");
  assert.equal(plan.text, "budget");
  assert.equal(plan.allowedNoteIds, null);
  assert.equal(plan.fullTextLimit, LIMIT);
  assert.deepEqual(resultIds(store, "budget", hitsFor(["note-plain", "note-both"])), [
    "note-plain",
    "note-both",
  ]);
});

test("a filter intersects full-text hits with the reference projection", () => {
  const store = fixtureStore();
  const all = hitsFor(["note-plain", "note-tag-only", "note-person-only", "note-both"]);
  assert.deepEqual(resultIds(store, "#design budget", all), ["note-tag-only", "note-both"]);
  assert.deepEqual(resultIds(store, "$ada budget", all), ["note-person-only", "note-both"]);
});

test("stacked filters intersect rather than union", () => {
  const store = fixtureStore();
  const all = hitsFor(["note-plain", "note-tag-only", "note-person-only", "note-both"]);
  assert.deepEqual(resultIds(store, "#design $ada budget", all), ["note-both"]);
  assert.deepEqual(resultIds(store, "#design #ops budget", all), []);
});

test("a filtered query over-fetches so intersection has rows to work with", () => {
  const plan = planWorkspaceSearch(fixtureStore().getState(), "#design budget", LIMIT);
  assert.ok(plan.fullTextLimit > LIMIT * 10);
  assert.equal(plan.requiresFullText, true);
});

test("a filter-only query lists the filtered set without full-text search", () => {
  const store = fixtureStore();
  const plan = planWorkspaceSearch(store.getState(), "#design", LIMIT);
  assert.equal(plan.status, "ready");
  assert.equal(plan.requiresFullText, false);
  assert.equal(plan.text, "");
  assert.deepEqual(
    applySearchPlan(store.getState(), plan, [], LIMIT)
      .map((hit) => hit.noteId)
      .sort(),
    ["note-both", "note-journal", "note-tag-only"],
  );
});

test("filter-only results carry a title and a body snippet", () => {
  const store = fixtureStore();
  const plan = planWorkspaceSearch(store.getState(), "$ada", LIMIT);
  const hits = applySearchPlan(store.getState(), plan, [], LIMIT);
  const launch = hits.find((hit) => hit.noteId === "note-both");
  assert.equal(launch?.title, "Launch plan");
  assert.equal(launch?.snippet, "budget and timeline");
});

test("trashed notes stay out of filtered results", () => {
  const store = fixtureStore();
  const plan = planWorkspaceSearch(store.getState(), "#design", LIMIT);
  assert.equal(plan.allowedNoteIds?.has("note-trashed"), false);
  assert.deepEqual(resultIds(store, "#design budget", hitsFor(["note-trashed"])), []);
});

test("journal entries participate in relationship filters so routing can claim them", () => {
  const store = fixtureStore();
  const plan = planWorkspaceSearch(store.getState(), "#design", LIMIT);
  assert.equal(plan.allowedNoteIds?.has("note-journal"), true);
  assert.deepEqual(resultIds(store, "#design budget", hitsFor(["note-journal"])), [
    "note-journal",
  ]);
});

test("an unknown or ambiguous name blocks the search instead of widening it", () => {
  const store = fixtureStore();
  const unknown = planWorkspaceSearch(store.getState(), "#nope budget", LIMIT);
  assert.equal(unknown.status, "blocked");
  assert.equal(unknown.requiresFullText, false);
  assert.equal(unknown.resolution.problems[0]?.reason, "unknown");
  assert.deepEqual(
    applySearchPlan(store.getState(), unknown, hitsFor(["note-plain"]), LIMIT),
    [],
  );

  store.applyReferenceOperations([{ type: "create_tag", tag: tag("tag-design-2", "Design") }]);
  const ambiguous = planWorkspaceSearch(store.getState(), "#design budget", LIMIT);
  assert.equal(ambiguous.status, "blocked");
  assert.equal(ambiguous.resolution.problems[0]?.reason, "ambiguous");
});

test("an incomplete operator keeps typing fluid without inventing a filter", () => {
  const store = fixtureStore();
  const plan = planWorkspaceSearch(store.getState(), "# budget", LIMIT);
  assert.equal(plan.status, "ready");
  assert.equal(plan.text, "budget");
  assert.equal(plan.allowedNoteIds, null);
  assert.equal(planWorkspaceSearch(store.getState(), "#", LIMIT).status, "idle");
});

test("a one-character query only reaches full-text search once a filter bounds it", () => {
  const store = fixtureStore();
  assert.equal(planWorkspaceSearch(store.getState(), "b", LIMIT).requiresFullText, false);
  assert.equal(planWorkspaceSearch(store.getState(), "#design b", LIMIT).requiresFullText, true);
});

test("planning and intersecting stay responsive across 5,000 notes", () => {
  const { snapshot, references } = largeReferenceFixture({
    noteCount: 5000,
    tagCount: 40,
    personCount: 40,
    referencesPerNote: 3,
  });
  const store = createRendererStore(createInitialState(snapshot, undefined, references));
  const state = store.getState();
  const hits = hitsFor(Array.from({ length: 200 }, (_, index) => `note-${index}`));
  const started = process.hrtime.bigint();
  for (let round = 0; round < 50; round += 1) {
    const plan = planWorkspaceSearch(state, `#"tag 0000" note`, LIMIT);
    assert.equal(plan.status, "ready");
    applySearchPlan(state, plan, hits, LIMIT);
  }
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(elapsedMs < 500, `50 filtered plans took ${elapsedMs.toFixed(1)}ms`);
});
