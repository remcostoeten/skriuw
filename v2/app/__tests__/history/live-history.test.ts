import assert from "node:assert/strict";
import test from "node:test";
import type { Event } from "@tauri-apps/api/event";
import type { HistoryHeader } from "../../src/contracts/workspace";
import {
  HISTORY_HEADER_PUBLISHED_EVENT,
  listenForHistoryHeaders,
} from "../../src/history/live-history";

test("history listener publishes bounded payloads and tears down exactly once", async () => {
  let handler: ((event: Event<HistoryHeader>) => void) | null = null;
  let teardownCalls = 0;
  const published: HistoryHeader[] = [];
  const unlisten = await listenForHistoryHeaders(
    (header) => {
      published.push(header);
    },
    async (event, nextHandler) => {
      assert.equal(event, HISTORY_HEADER_PUBLISHED_EVENT);
      handler = nextHandler;
      return () => {
        teardownCalls += 1;
        handler = null;
      };
    },
  );
  const payload = {
    noteId: "note-1",
    versionId: "version-1",
    createdAt: 10,
    summary: "Saved note",
  };

  assert.ok(handler);
  handler({ event: HISTORY_HEADER_PUBLISHED_EVENT, id: 1, payload });
  assert.deepEqual(published, [payload]);
  unlisten();
  assert.equal(handler, null);
  assert.equal(teardownCalls, 1);
});
