import assert from "node:assert/strict";
import test from "node:test";
import { SaveSequencer } from "../../src/editor/save-sequencer";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("serializes saves for the same note through acknowledgement", async () => {
  const sequencer = new SaveSequencer();
  const firstAck = deferred();
  const events: string[] = [];
  const first = sequencer.enqueue("note-1", async () => {
    events.push("first:start");
    await firstAck.promise;
    events.push("first:ack");
  });
  const second = sequencer.enqueue("note-1", async () => {
    events.push("second:start");
  });

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["first:start"]);
  firstAck.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(events, ["first:start", "first:ack", "second:start"]);
});

test("a failed save does not strand the next save or flush", async () => {
  const sequencer = new SaveSequencer();
  const events: string[] = [];
  const first = sequencer.enqueue("note-1", async () => {
    events.push("failed");
    throw new Error("durable failure");
  });
  const second = sequencer.enqueue("note-1", async () => {
    events.push("recovered");
  });

  await assert.rejects(first, /durable failure/);
  await second;
  await sequencer.flush();
  assert.deepEqual(events, ["failed", "recovered"]);
});

test("failure remains visible and flush rejects while a save is undurable", async () => {
  const observed: string[][] = [];
  const sequencer = new SaveSequencer((failures) => {
    observed.push(failures.map(({ noteId }) => noteId));
  });

  await assert.rejects(
    sequencer.enqueue("note-1", async () => {
      throw new Error("disk full");
    }),
    /disk full/,
  );

  assert.deepEqual(sequencer.currentFailures().map(({ noteId }) => noteId), ["note-1"]);
  await assert.rejects(sequencer.flush(), /1 note.*not durable/);
  assert.deepEqual(observed, [["note-1"]]);
});

test("a retry runs after failure and clears recovery state only after durability", async () => {
  const sequencer = new SaveSequencer();
  let latestDocument = "failed draft";
  let durableDocument = "";

  await assert.rejects(
    sequencer.enqueue("note-1", async () => {
      throw new Error("unavailable");
    }),
  );
  latestDocument = "newest complete document";
  await sequencer.enqueue("note-1", async () => {
    durableDocument = latestDocument;
  });

  await sequencer.flush();
  assert.equal(durableDocument, "newest complete document");
  assert.deepEqual(sequencer.currentFailures(), []);
});

test("failure and recovery are independent between notes", async () => {
  const sequencer = new SaveSequencer();
  const failed = sequencer.enqueue("note-1", async () => {
    throw new Error("note one failed");
  });
  const saved = sequencer.enqueue("note-2", async () => {});

  await assert.rejects(failed);
  await saved;
  assert.deepEqual(sequencer.currentFailures().map(({ noteId }) => noteId), ["note-1"]);
  await sequencer.enqueue("note-1", async () => {});
  await sequencer.flush();
});

test("different notes may save concurrently", async () => {
  const sequencer = new SaveSequencer();
  const gate = deferred();
  const events: string[] = [];
  const first = sequencer.enqueue("note-1", async () => {
    events.push("one");
    await gate.promise;
  });
  const second = sequencer.enqueue("note-2", async () => {
    events.push("two");
  });

  await second;
  assert.deepEqual(events, ["one", "two"]);
  gate.resolve();
  await first;
});
