import assert from "node:assert/strict";
import test from "node:test";
import { describeSearchFilterProblem } from "../query/filter-resolution";
import { parseSearchQuery } from "../query/query-parser";
import { applySearchPlan, MIN_FULL_TEXT_LENGTH, planWorkspaceSearch } from "../query/search-plan";
import { stateOf, type NoteSeed } from "./workspace.cjs";

const NOTES: readonly NoteSeed[] = [
  {
    id: "note-tokens",
    title: "Theme tokens",
    body: "The generated token map is drift-checked.",
    tags: ["design system"],
    people: ["Ada Lovelace"],
    updatedAt: 30,
  },
  {
    id: "note-sheet",
    title: "Sheet gesture",
    body: "A pull from the edge opens the tree.",
    tags: ["design system"],
    updatedAt: 20,
  },
  {
    id: "note-index",
    title: "Index rebuild",
    body: "The projection is rebuildable and never blocks navigation.",
    tags: ["search"],
    people: ["Ada Lovelace"],
    updatedAt: 10,
  },
];

function planFor(query: string, limit = 20) {
  const state = stateOf({
    notes: NOTES,
    tags: ["design system", "search"],
    people: ["Ada Lovelace"],
  });
  return { state, plan: planWorkspaceSearch(state, query, limit) };
}

test("free text below the minimum length asks storage for nothing", () => {
  const { plan } = planFor("t");
  assert.equal(MIN_FULL_TEXT_LENGTH, 2);
  assert.equal(plan.status, "idle");
  assert.equal(plan.requiresFullText, false);
});

test("free text is handed to the backend with every operator removed", () => {
  const { plan } = planFor('#"design system" token map');
  assert.equal(plan.text, "token map");
  assert.equal(plan.requiresFullText, true);
  assert.deepEqual([...(plan.allowedNoteIds ?? [])].sort(), ["note-sheet", "note-tokens"]);
});

test("a tag operator narrows the candidate set to the notes that carry it", () => {
  const { plan } = planFor("#search");
  assert.deepEqual([...(plan.allowedNoteIds ?? [])], ["note-index"]);
  assert.equal(plan.requiresFullText, false);
  assert.equal(plan.status, "ready");
});

test("the keyword form of an operator means the same as its sigil", () => {
  const sigil = planFor('$"Ada Lovelace"').plan;
  const keyword = planFor('person:"ada lovelace"').plan;
  assert.deepEqual([...(sigil.allowedNoteIds ?? [])], [...(keyword.allowedNoteIds ?? [])]);
});

test("two operators intersect rather than widen", () => {
  const { plan } = planFor('#"design system" $"Ada Lovelace"');
  assert.deepEqual([...(plan.allowedNoteIds ?? [])], ["note-tokens"]);
});

test("one character is enough once an operator bounds the query", () => {
  const { plan } = planFor("#search t");
  assert.equal(plan.text, "t");
  assert.equal(plan.requiresFullText, true);
});

test("an escaped sigil searches for the character instead of filtering", () => {
  const parsed = parseSearchQuery("\\#literal");
  assert.deepEqual(parsed.filters, []);
  assert.equal(parsed.text, "#literal");
});

test("a name nothing carries blocks the query instead of answering a different one", () => {
  const { state, plan } = planFor("#nonexistent tokens");
  assert.equal(plan.status, "blocked");
  assert.deepEqual(applySearchPlan(state, plan, [], 20), []);
  assert.equal(
    describeSearchFilterProblem(plan.resolution.problems[0]!),
    "No tag named “nonexistent”.",
  );
});

test("a filter-only query is ordered by recency, not by a score invented here", () => {
  const { state, plan } = planFor('#"design system"');
  const hits = applySearchPlan(state, plan, [], 20);
  assert.deepEqual(
    hits.map((hit) => hit.noteId),
    ["note-tokens", "note-sheet"],
  );
  assert.ok(hits.every((hit) => hit.score === 0));
});

test("backend order survives the filter intersection", () => {
  const { state, plan } = planFor('#"design system" the');
  const ranked = [
    { noteId: "note-index", title: "Index rebuild", snippet: "the", score: 9 },
    { noteId: "note-sheet", title: "Sheet gesture", snippet: "the", score: 5 },
    { noteId: "note-tokens", title: "Theme tokens", snippet: "the", score: 1 },
  ];
  assert.deepEqual(
    applySearchPlan(state, plan, ranked, 20).map((hit) => hit.noteId),
    ["note-sheet", "note-tokens"],
  );
});

test("the limit bounds what a surface is handed", () => {
  const { state, plan } = planFor('#"design system"', 1);
  assert.equal(applySearchPlan(state, plan, [], 1).length, 1);
});
