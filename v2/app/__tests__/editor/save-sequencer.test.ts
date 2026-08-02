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
