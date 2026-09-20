import assert from "node:assert/strict";
import test from "node:test";
import type { SearchIndexStatus } from "../../../../../shared/renderer-core/src/contracts/workspace";
import {
  describeSearchIndex,
  reconcileSearchIndex,
  type SearchIndexView,
} from "../index-status";

function status(overrides: Partial<SearchIndexStatus> = {}): SearchIndexStatus {
  return {
    indexVersion: 1,
    currentVersion: 1,
    indexedNotes: 1_000,
    noteCount: 1_000,
    needsRebuild: false,
    ...overrides,
  };
}

test("a current index costs one status read and says nothing", async () => {
  let rebuilds = 0;
  const views: SearchIndexView[] = [];

  const outcome = await reconcileSearchIndex(
    {
      readStatus: async () => status(),
      rebuild: async () => {
        rebuilds += 1;
        return status();
      },
    },
    (view) => views.push(view),
  );

  assert.equal(rebuilds, 0);
  assert.equal(outcome.rebuilt, false);
  assert.deepEqual(views.map((view) => view.state), ["current"]);
  assert.equal(describeSearchIndex(outcome.view), null);
});

test("a drifted index is surfaced as rebuilding before it is rebuilt", async () => {
  const views: SearchIndexView[] = [];

  const outcome = await reconcileSearchIndex(
    {
      readStatus: async () => status({ indexVersion: 0, indexedNotes: 240, needsRebuild: true }),
      rebuild: async () => status(),
    },
    (view) => views.push(view),
  );

  assert.equal(outcome.rebuilt, true);
  assert.deepEqual(views.map((view) => view.state), ["rebuilding", "current"]);
  assert.equal(
    describeSearchIndex(views[0]!),
    "Rebuilding search index — 240 of 1000 notes.",
  );
  assert.equal(describeSearchIndex(outcome.view), null);
});

test("a runtime that refuses the status read says so instead of reading as empty", async () => {
  const views: SearchIndexView[] = [];

  const outcome = await reconcileSearchIndex(
    {
      readStatus: async () => {
        throw new Error("Search is not available in this build of Skriuw.");
      },
      rebuild: async () => status(),
    },
    (view) => views.push(view),
  );

  assert.deepEqual(views.map((view) => view.state), ["unavailable"]);
  assert.equal(describeSearchIndex(outcome.view), "Search is not available in this build of Skriuw.");
});

test("a rebuild that fails leaves the failure visible", async () => {
  const outcome = await reconcileSearchIndex(
    {
      readStatus: async () => status({ needsRebuild: true }),
      rebuild: async () => {
        throw new Error("The index could not be rebuilt.");
      },
    },
    () => undefined,
  );

  assert.equal(outcome.rebuilt, true);
  assert.equal(outcome.view.state, "unavailable");
  assert.equal(describeSearchIndex(outcome.view), "The index could not be rebuilt.");
});
