import assert from "node:assert/strict";
import test from "node:test";
import type { AiCompletionEvent } from "../../../src/contracts/ai";
import { createAiCompletionConsumer } from "../../../src/features/ai/completion-consumer";

test("completion consumer accepts ordered deltas and one terminal", () => {
  const deltas: string[] = [];
  const terminals: AiCompletionEvent[] = [];
  const consumer = createAiCompletionConsumer("request-1", {
    onDelta: (text) => deltas.push(text),
    onTerminal: (event) => terminals.push(event),
  });

  assert.equal(
    consumer.accept({ type: "delta", requestId: "request-1", sequence: 0, text: "one" }),
    true,
  );
  assert.equal(consumer.accept({ type: "done", requestId: "request-1" }), true);
  assert.equal(consumer.accept({ type: "cancelled", requestId: "request-1" }), false);
  assert.deepEqual(deltas, ["one"]);
  assert.equal(terminals.length, 1);
});

test("completion consumer rejects mismatched and out-of-order deltas", () => {
  const deltas: string[] = [];
  const consumer = createAiCompletionConsumer("request-1", {
    onDelta: (text) => deltas.push(text),
    onTerminal: () => undefined,
  });

  assert.equal(
    consumer.accept({ type: "delta", requestId: "request-2", sequence: 0, text: "wrong" }),
    false,
  );
  assert.equal(
    consumer.accept({ type: "delta", requestId: "request-1", sequence: 1, text: "late" }),
    false,
  );
  assert.deepEqual(deltas, []);
});

test("disposed completion consumer ignores queued late results", () => {
  const deltas: string[] = [];
  const consumer = createAiCompletionConsumer("request-1", {
    onDelta: (text) => deltas.push(text),
    onTerminal: () => undefined,
  });

  consumer.dispose();

  assert.equal(
    consumer.accept({ type: "delta", requestId: "request-1", sequence: 0, text: "late" }),
    false,
  );
  assert.deepEqual(deltas, []);
});
