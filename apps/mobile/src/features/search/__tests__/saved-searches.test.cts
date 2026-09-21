import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryBridge } from "@skriuw/renderer-core/bridge/memory-adapter";
import type { WorkspaceSession } from "../../../bridge/commit";
import {
  SAVED_SEARCH_LIMIT,
  SAVED_SEARCH_MAX_LENGTH,
  savedSearchView,
  savedSearchViewsEqual,
  savedSearches,
  setSearchSaved,
} from "../saved/saved-searches";
import { snapshotOf, storeOf, TEST_SETTINGS } from "./workspace.cjs";

function sessionOf(saved?: unknown): WorkspaceSession {
  const settings = saved === undefined ? TEST_SETTINGS : { ...TEST_SETTINGS, savedSearches: saved };
  const snapshot = snapshotOf({
    notes: [{ id: "note-a", title: "Alpha", body: "body" }],
    settings,
  });
  return {
    store: storeOf(snapshot),
    bridge: createMemoryBridge({ snapshot }),
    reportFailure: (error: unknown) => {
      throw error;
    },
  };
}

test("a workspace that never saved a query reads as an empty list", () => {
  assert.deepEqual(savedSearches(TEST_SETTINGS), []);
});

test("saving and removing a query travels as update_settings and survives a reload", async () => {
  const session = sessionOf();

  await setSearchSaved(session, "  #search rebuild  ", true);
  assert.deepEqual(savedSearches(session.store.getState().settings), ["#search rebuild"]);

  const reloaded = await session.bridge.bootstrapWorkspace();
  assert.deepEqual(savedSearches(reloaded.settings), ["#search rebuild"]);

  await setSearchSaved(session, "#search rebuild", false);
  assert.deepEqual(savedSearches(session.store.getState().settings), []);
});

test("saving a query that is already saved writes nothing", async () => {
  const session = sessionOf(["#search"]);
  let submitted = 0;
  const bridge = session.bridge;
  session.bridge = {
    ...bridge,
    applyWorkspaceOperations: async (operations) => {
      submitted += 1;
      return bridge.applyWorkspaceOperations(operations);
    },
  };

  await setSearchSaved(session, "#search", true);

  assert.equal(submitted, 0);
});

test("an empty or oversized query is refused with the bound it broke", async () => {
  const session = sessionOf();
  await assert.rejects(setSearchSaved(session, "   ", true), /1–512 characters/);
  await assert.rejects(
    setSearchSaved(session, "x".repeat(SAVED_SEARCH_MAX_LENGTH + 1), true),
    /1–512 characters/,
  );
});

test("the list stops growing at its limit", async () => {
  const session = sessionOf(
    Array.from({ length: SAVED_SEARCH_LIMIT }, (_unused, index) => `query ${index}`),
  );
  await assert.rejects(setSearchSaved(session, "one too many", true), /limit: 100/);
});

test("an unreadable preference costs the chips, not the frame", () => {
  assert.throws(
    () => savedSearches({ ...TEST_SETTINGS, savedSearches: [42] }),
    /Restore a verified workspace backup/,
  );
  const view = savedSearchView({ ...TEST_SETTINGS, savedSearches: [42] });
  assert.deepEqual(view.queries, []);
  assert.match(view.error ?? "", /Restore a verified workspace backup/);
});

test("an unchanged list compares equal so the chips stay quiet", () => {
  const left = savedSearchView({ ...TEST_SETTINGS, savedSearches: ["#search"] });
  const right = savedSearchView({ ...TEST_SETTINGS, savedSearches: ["#search"] });
  assert.ok(savedSearchViewsEqual(left, right));
  assert.equal(
    savedSearchViewsEqual(left, savedSearchView({ ...TEST_SETTINGS, savedSearches: ["#theme"] })),
    false,
  );
});
