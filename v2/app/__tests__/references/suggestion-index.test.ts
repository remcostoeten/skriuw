import assert from "node:assert/strict";
import test from "node:test";
import {
  queryMentionSuggestions,
  queryTagSuggestions,
} from "../../src/references/suggestion-index";
import { createInitialState, createRendererStore } from "../../src/store/store";
import { referenceFixture, tag } from "./fixtures";

function fixtureState() {
  const { snapshot, references } = referenceFixture();
  return createInitialState(snapshot, undefined, references);
}

test("tag suggestions rank exact before prefix before substring", () => {
  const { snapshot, references } = referenceFixture();
  const state = createInitialState(snapshot, undefined, {
    ...references,
    tags: [
      tag("t-1", "release-notes"),
      tag("t-2", "rel"),
      tag("t-3", "unrelated"),
      tag("t-4", "prerelease"),
    ],
  });
  assert.deepEqual(
    queryTagSuggestions(state, "rel").map((suggestion) => suggestion.label),
    ["rel", "release-notes", "prerelease", "unrelated"],
  );
});

test("tag suggestions are bounded and alphabetical for empty queries", () => {
  const { snapshot, references } = referenceFixture();
  const many = Array.from({ length: 20 }, (_, index) =>
    tag(`t-${index}`, `tag-${index.toString().padStart(2, "0")}`),
  );
  const state = createInitialState(snapshot, undefined, { ...references, tags: many });
  const suggestions = queryTagSuggestions(state, "");
  assert.equal(suggestions.length, 8);
  assert.deepEqual(
    suggestions.map((suggestion) => suggestion.label),
    many.slice(0, 8).map((entry) => entry.name),
  );
});

test("mention suggestions group people and notes and exclude the active note", () => {
  const state = fixtureState();
  const grouped = queryMentionSuggestions(state, "");
  assert.deepEqual(
    grouped.people.map((suggestion) => suggestion.label),
    ["Ada", "Bob"],
  );
  assert.equal(grouped.notes.some((suggestion) => suggestion.id === state.activeNoteId), false);
  assert.equal(
    grouped.notes.every((suggestion) => suggestion.kind === "note"),
    true,
  );
});

test("trashed notes are never offered as mention targets", () => {
  const state = fixtureState();
  const grouped = queryMentionSuggestions(state, "trashed");
  assert.deepEqual(grouped.notes, []);
});

test("deleted tags and people leave completion immediately", () => {
  const { snapshot, references } = referenceFixture();
  const store = createRendererStore(createInitialState(snapshot, undefined, references));
  store.applyReferenceOperations([
    { type: "delete_tag", id: "tag-alpha" },
    { type: "delete_person", id: "person-ada" },
  ]);
  const state = store.getState();
  assert.deepEqual(queryTagSuggestions(state, "alpha"), []);
  assert.deepEqual(queryMentionSuggestions(state, "ada").people, []);
});

test("suggestion queries are deterministic for an unchanged source map", () => {
  const state = fixtureState();
  assert.deepEqual(queryTagSuggestions(state, "alpha"), queryTagSuggestions(state, "alpha"));
});
