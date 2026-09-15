import assert from "node:assert/strict";
import test from "node:test";
import type { SearchIndexStatus } from "../../../src/contracts/workspace";
import {
  reconcileSearchIndex,
  type SearchIndexPorts,
} from "../../../src/features/search/index-maintenance";

function status(overrides: Partial<SearchIndexStatus> = {}): SearchIndexStatus {
  return {
    indexVersion: 2,
    currentVersion: 2,
    indexedNotes: 12,
    noteCount: 12,
    needsRebuild: false,
    ...overrides,
  };
}

function ports(initial: SearchIndexStatus): SearchIndexPorts & { rebuilds: number } {
  const state = { rebuilds: 0 };
  return {
    get rebuilds() {
      return state.rebuilds;
    },
    readStatus: () => Promise.resolve(initial),
    rebuild: () => {
      state.rebuilds += 1;
      return Promise.resolve(status());
    },
  };
}

test("a current index costs one status read and no rebuild", async () => {
  const port = ports(status());

  const result = await reconcileSearchIndex(port);

  assert.equal(result.rebuilt, false);
  assert.equal(port.rebuilds, 0);
});

test("a drifted projection version triggers exactly one rebuild", async () => {
  const port = ports(status({ indexVersion: 1, needsRebuild: true }));

  const result = await reconcileSearchIndex(port);

  assert.equal(result.rebuilt, true);
  assert.equal(port.rebuilds, 1);
  assert.equal(result.status.needsRebuild, false);
});

test("rows lost under the index are rebuilt even at the current version", async () => {
  const port = ports(status({ indexedNotes: 3, noteCount: 12, needsRebuild: true }));

  const result = await reconcileSearchIndex(port);

  assert.equal(result.rebuilt, true);
  assert.equal(result.status.indexedNotes, 12);
});

test("a failing status read rejects instead of reporting a healthy index", async () => {
  const failure: SearchIndexPorts = {
    readStatus: () => Promise.reject(new Error("storage unavailable")),
    rebuild: () => Promise.resolve(status()),
  };

  await assert.rejects(reconcileSearchIndex(failure), /storage unavailable/);
});
