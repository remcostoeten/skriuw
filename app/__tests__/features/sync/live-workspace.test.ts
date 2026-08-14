import assert from "node:assert/strict";
import test from "node:test";
import type { Event } from "@tauri-apps/api/event";
import {
  listenForSyncedWorkspaceChanges,
  SYNC_WORKSPACE_CHANGED_EVENT,
} from "../../../src/features/sync/live-workspace";

test("desktop sync events reconcile and tear down", async () => {
  let handler: ((event: Event<void>) => void) | null = null;
  let reconciliations = 0;
  let teardownCalls = 0;
  const unlisten = await listenForSyncedWorkspaceChanges(
    () => {
      reconciliations += 1;
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
  handler({ event: SYNC_WORKSPACE_CHANGED_EVENT, id: 1, payload: undefined });
  assert.equal(reconciliations, 1);
  unlisten();
  assert.equal(handler, null);
  assert.equal(teardownCalls, 1);
});

test("browser sync changes use the in-process worker subscription", async () => {
  let handler: (() => void) | null = null;
  let reconciliations = 0;
  const unlisten = await listenForSyncedWorkspaceChanges(
    () => {
      reconciliations += 1;
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
  handler();
  assert.equal(reconciliations, 1);
  unlisten();
  assert.equal(handler, null);
});
