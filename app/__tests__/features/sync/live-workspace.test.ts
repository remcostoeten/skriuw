import assert from "node:assert/strict";
import test from "node:test";
import type { Event } from "@tauri-apps/api/event";
import {
  listenForSyncedWorkspaceChanges,
  mergeWorkspaceChanges,
  SYNC_WORKSPACE_CHANGED_EVENT,
  type WorkspaceChange,
} from "../../../src/features/sync/live-workspace";

test("desktop sync events deliver the change payload and tear down", async () => {
  let handler: ((event: Event<WorkspaceChange>) => void) | null = null;
  const received: WorkspaceChange[] = [];
  let teardownCalls = 0;
  const unlisten = await listenForSyncedWorkspaceChanges(
    (change) => {
      received.push(change);
    },
    async (event, nextHandler) => {
      assert.equal(event, SYNC_WORKSPACE_CHANGED_EVENT);
      handler = nextHandler;
      return () => {
        handler = null;
        teardownCalls += 1;
      };
    },
    false,
  );

  assert.ok(handler);
  handler({
    event: SYNC_WORKSPACE_CHANGED_EVENT,
    id: 1,
    payload: { noteIds: ["n1", "n2"], structureChanged: false, full: false },
  });
  assert.deepEqual(received, [{ noteIds: ["n1", "n2"], structureChanged: false, full: false }]);
  unlisten();
  assert.equal(handler, null);
  assert.equal(teardownCalls, 1);
});

test("a malformed or missing payload reconciles everything rather than nothing", async () => {
  let handler: ((event: Event<WorkspaceChange>) => void) | null = null;
  const received: WorkspaceChange[] = [];
  await listenForSyncedWorkspaceChanges(
    (change) => {
      received.push(change);
    },
    async (_event, nextHandler) => {
      handler = nextHandler;
      return () => undefined;
    },
    false,
  );
  assert.ok(handler);
  handler({ event: SYNC_WORKSPACE_CHANGED_EVENT, id: 1, payload: undefined as never });
  handler({
    event: SYNC_WORKSPACE_CHANGED_EVENT,
    id: 2,
    payload: { noteIds: ["ok", 3], structureChanged: "yes" } as never,
  });
  assert.deepEqual(received, [
    { noteIds: [], structureChanged: true, full: true },
    { noteIds: ["ok"], structureChanged: false, full: false },
  ]);
});

test("browser sync changes use the in-process worker subscription", async () => {
  let handler: ((change: WorkspaceChange) => void) | null = null;
  const received: WorkspaceChange[] = [];
  const unlisten = await listenForSyncedWorkspaceChanges(
    (change) => {
      received.push(change);
    },
    async () => assert.fail("the Tauri listener must stay unused in a browser"),
    true,
    (nextHandler) => {
      handler = nextHandler;
      return () => {
        handler = null;
      };
    },
  );

  assert.ok(handler);
  handler({ noteIds: ["n1"], structureChanged: true, full: false });
  assert.deepEqual(received, [{ noteIds: ["n1"], structureChanged: true, full: false }]);
  unlisten();
  assert.equal(handler, null);
});

test("merged changes union note ids and widen to the broadest scope", () => {
  const merged = mergeWorkspaceChanges(
    { noteIds: ["a", "b"], structureChanged: false, full: false },
    { noteIds: ["b", "c"], structureChanged: true, full: false },
  );
  assert.deepEqual(merged, { noteIds: ["a", "b", "c"], structureChanged: true, full: false });
  assert.deepEqual(
    mergeWorkspaceChanges(null, { noteIds: [], structureChanged: false, full: true }),
    { noteIds: [], structureChanged: false, full: true },
  );
});
