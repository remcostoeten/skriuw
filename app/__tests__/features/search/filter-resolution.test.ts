import assert from "node:assert/strict";
import test from "node:test";
import {
  describeSearchFilterProblem,
  resolveSearchFilters,
} from "../../../src/features/search/filter-resolution";
import { parseSearchQuery } from "../../../src/features/search/query-parser";
import { createInitialState, createRendererStore } from "../../../src/store/store";
import type { RendererStore } from "../../../src/store/types";
import { referenceFixture, tag } from "../references/fixtures";

function createFixtureStore(): RendererStore {
  const { snapshot, references } = referenceFixture();
  return createRendererStore(createInitialState(snapshot, undefined, references));
}

function resolve(store: RendererStore, query: string) {
  return resolveSearchFilters(store.getState(), parseSearchQuery(query).filters);
}

test("names resolve to hydrated ids across case and sigil spelling", () => {
  const store = createFixtureStore();
  const resolution = resolve(store, "#ALPHA tag:Alpha $ada person:ADA");
  assert.deepEqual(resolution.problems, []);
  assert.deepEqual(
    resolution.resolved.map((filter) => [filter.kind, filter.targetId, filter.label]),
    [
      ["tag", "tag-alpha", "alpha"],
      ["person", "person-ada", "Ada"],
    ],
  );
});

test("a name matching nothing is reported, never dropped", () => {
  const store = createFixtureStore();
  const resolution = resolve(store, "#nope");
  assert.deepEqual(resolution.resolved, []);
  assert.deepEqual(resolution.problems, [
    { kind: "tag", name: "nope", reason: "unknown", candidates: [] },
  ]);
  assert.equal(describeSearchFilterProblem(resolution.problems[0]!), "No tag named “nope”.");
});

test("a tag name is not resolved against people", () => {
  const store = createFixtureStore();
  assert.equal(resolve(store, "#ada").problems[0]?.reason, "unknown");
  assert.equal(resolve(store, "$alpha").problems[0]?.reason, "unknown");
});

test("a duplicated name is ambiguous with every candidate and no silent pick", () => {
  const store = createFixtureStore();
  store.applyReferenceOperations([{ type: "create_tag", tag: tag("tag-alpha-2", "Alpha") }]);
  const problem = resolve(store, "#alpha").problems[0];
  assert.equal(problem?.reason, "ambiguous");
  assert.deepEqual(
    problem?.candidates.map((candidate) => candidate.id),
    ["tag-alpha", "tag-alpha-2"],
  );
  assert.match(describeSearchFilterProblem(problem!), /matches 2 tags \(alpha, Alpha\)/);
  assert.deepEqual(resolve(store, "#alpha").resolved, []);
});

test("renaming an entity moves the name that resolves to it", () => {
  const store = createFixtureStore();
  assert.equal(resolve(store, "#alpha").resolved[0]?.targetId, "tag-alpha");
  store.applyReferenceOperations([{ type: "rename_tag", id: "tag-alpha", name: "Design" }]);
  assert.equal(resolve(store, "#alpha").problems[0]?.reason, "unknown");
  assert.equal(resolve(store, "#design").resolved[0]?.targetId, "tag-alpha");
});

test("renaming into a collision produces ambiguity instead of a guess", () => {
  const store = createFixtureStore();
  store.applyReferenceOperations([{ type: "rename_tag", id: "tag-beta", name: "alpha" }]);
  const problem = resolve(store, "#alpha").problems[0];
  assert.equal(problem?.reason, "ambiguous");
  assert.deepEqual(
    problem?.candidates.map((candidate) => candidate.id),
    ["tag-alpha", "tag-beta"],
  );
});

test("deleting an entity makes its name unknown", () => {
  const store = createFixtureStore();
  store.applyReferenceOperations([{ type: "delete_person", id: "person-ada" }]);
  assert.equal(resolve(store, "$ada").problems[0]?.reason, "unknown");
});
