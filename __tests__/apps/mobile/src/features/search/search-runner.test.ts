import assert from "node:assert/strict";
import { test } from "vitest";
import type { SearchHit } from "@skriuw/renderer-core/contracts/workspace";
import { activateNote } from "@/shell/tree-actions";
import {
  createSearchRunner,
  percentile,
  SEARCH_RESULT_LIMIT,
} from "@/features/search/run/search-runner";
import { snapshotOf, stateOf, storeOf, type NoteSeed } from "./workspace";

const NOTES: readonly NoteSeed[] = [
  { id: "note-a", title: "Alpha", body: "ranked first by storage", tags: ["search"] },
  { id: "note-b", title: "Beta", body: "ranked second by storage", tags: ["search"] },
  { id: "note-c", title: "Gamma", body: "not in the candidate set", tags: ["theme"] },
];

function state() {
  return stateOf({ notes: NOTES, tags: ["search", "theme"], people: [] });
}

function hit(noteId: string, score: number): SearchHit {
  return { noteId, title: noteId, snippet: "ranked <mark>by</mark> storage", score };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

test("the backend is asked for the free text and the candidate set, and its order is kept", async () => {
  const calls: { query: string; limit: number; noteIds: readonly string[] | null }[] = [];
  const runner = createSearchRunner({
    getState: state,
    search: async (query, limit, noteIds) => {
      calls.push({ query, limit, noteIds });
      return [hit("note-b", 9), hit("note-a", 2)];
    },
  });

  const outcome = await runner.run("#search ranked");

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.query, "ranked");
  assert.equal(calls[0]?.limit, SEARCH_RESULT_LIMIT);
  assert.deepEqual([...(calls[0]?.noteIds ?? [])].sort(), ["note-a", "note-b"]);
  assert.deepEqual(
    outcome?.hits.map((entry) => entry.noteId),
    ["note-b", "note-a"],
  );
  assert.equal(outcome?.status, "ready");
});

test("a filter-only query never reaches the backend", async () => {
  let called = 0;
  const runner = createSearchRunner({
    getState: state,
    search: async () => {
      called += 1;
      return [];
    },
  });

  const outcome = await runner.run("#search");

  assert.equal(called, 0);
  assert.deepEqual(
    outcome?.hits.map((entry) => entry.noteId),
    ["note-b", "note-a"],
  );
});

test("a response the field has moved past is dropped rather than shown", async () => {
  const slow = deferred<readonly SearchHit[]>();
  const fast = deferred<readonly SearchHit[]>();
  const pending = [slow, fast];
  let index = 0;
  const runner = createSearchRunner({
    getState: state,
    search: async () => {
      const next = pending[index];
      index += 1;
      return next === undefined ? [] : next.promise;
    },
  });

  const first = runner.run("ranked");
  const second = runner.run("storage");
  fast.resolve([hit("note-b", 1)]);
  slow.resolve([hit("note-a", 1)]);

  assert.equal(await first, null);
  assert.deepEqual(
    (await second)?.hits.map((entry) => entry.noteId),
    ["note-b"],
  );
});

test("an unresolved filter reports its problem instead of results", async () => {
  const runner = createSearchRunner({
    getState: state,
    search: async () => [hit("note-a", 1)],
  });

  const outcome = await runner.run("#nobody ranked");

  assert.equal(outcome?.status, "blocked");
  assert.deepEqual(outcome?.hits, []);
  assert.deepEqual(outcome?.problems, ["No tag named “nobody”."]);
});

test("every answered query contributes one latency sample", async () => {
  const samples: number[] = [];
  let clock = 0;
  const runner = createSearchRunner({
    getState: state,
    search: async () => {
      clock += 7;
      return [];
    },
    now: () => clock,
    onSample: (elapsedMs) => samples.push(elapsedMs),
  });

  await runner.run("ranked");
  await runner.run("storage");

  assert.deepEqual(samples, [7, 7]);
});

test("opening a hit is a store update, so the note is active in the same frame", () => {
  const store = storeOf(snapshotOf({ notes: NOTES }));
  let notifications = 0;
  store.subscribe(
    (current) => current.activeNoteId,
    () => {
      notifications += 1;
    },
  );

  activateNote(store, "note-b");

  assert.equal(store.getState().activeNoteId, "note-b");
  assert.equal(store.getState().focusedNodeId, "note-b");
  assert.equal(notifications, 1);
});

test("the percentile reports the sample at the nearest rank", () => {
  assert.equal(percentile([], 95), null);
  assert.equal(percentile([5], 95), 5);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
  assert.equal(percentile([10, 1, 5], 50), 5);
});
