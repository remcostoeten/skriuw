import assert from "node:assert/strict";
import test from "node:test";
import type { AiCompletionEvent } from "../../../src/contracts/ai";
import { createAiCompletionConsumer } from "../../../src/features/ai/completion-consumer";
import { aiEditorAction } from "../../../src/features/ai/editor-actions";
import { parseTaskPlan } from "../../../src/features/ai/action-plan";
import {
  IDLE_RUN,
  aiActionStatusLine,
  applyRefusal,
  canRetryRun,
  failedRun,
  runHasResult,
  runIsStreaming,
  runWithDelta,
  runWithTerminal,
  startedRun,
  type AiActionRun,
  type AiActionTarget,
} from "../../../src/features/ai/editor-action-model";

const REWRITE = aiEditorAction("rewrite")!;
const EXTRACT = aiEditorAction("extract-tasks")!;

const TARGET: AiActionTarget = {
  noteId: "note-1",
  from: 1,
  to: 10,
  input: "the original selection",
};

/**
 * Drives a run the way the host does — through the same ordered consumer the
 * bridge feeds — so these cases exercise the shipped renderer contract rather
 * than a parallel test-only path.
 */
function drive(requestId: string, events: readonly AiCompletionEvent[]): AiActionRun {
  let run = startedRun(requestId);
  const consumer = createAiCompletionConsumer(requestId, {
    onDelta: (text) => {
      run = runWithDelta(run, requestId, text);
    },
    onTerminal: (event) => {
      run = runWithTerminal(run, event);
    },
  });
  for (const event of events) {
    consumer.accept(event);
  }
  return run;
}

test("ordered deltas stream into the preview buffer and finish as a result", () => {
  const run = drive("r1", [
    { type: "delta", requestId: "r1", sequence: 0, text: "Hello " },
    { type: "delta", requestId: "r1", sequence: 1, text: "there" },
    { type: "done", requestId: "r1" },
  ]);

  assert.equal(run.phase, "done");
  assert.equal(run.preview, "Hello there");
  assert.equal(runHasResult(run), true);
  assert.match(aiActionStatusLine(run, REWRITE), /finished: 11 characters/);
});

test("cancelling keeps the buffer and never claims a result to apply", () => {
  const run = drive("r1", [
    { type: "delta", requestId: "r1", sequence: 0, text: "half a sen" },
    { type: "cancelled", requestId: "r1" },
  ]);

  assert.equal(run.phase, "cancelled");
  assert.equal(runHasResult(run), false);
  assert.equal(runIsStreaming(run), false);
  assert.equal(canRetryRun(run), true);
  assert.match(aiActionStatusLine(run, REWRITE), /cancelled\. The note is unchanged/);
});

test("a timeout terminates the run and says the note is untouched", () => {
  const run = drive("r1", [{ type: "timeout", requestId: "r1" }]);

  assert.equal(run.phase, "timeout");
  assert.equal(runHasResult(run), false);
  assert.match(aiActionStatusLine(run, REWRITE), /timed out\. The note is unchanged/);
});

test("a malformed provider response surfaces its own message", () => {
  const run = drive("r1", [
    {
      type: "provider_error",
      requestId: "r1",
      error: {
        providerId: "ollama",
        category: "malformed_response",
        message: "The provider sent output this build cannot read.",
        recoveryAction: "retry",
      },
    },
  ]);

  assert.equal(run.phase, "error");
  assert.equal(run.error?.category, "malformed_response");
  assert.match(aiActionStatusLine(run, REWRITE), /cannot read/);
});

test("output that is not a list is a malformed plan, not an empty apply", () => {
  const run = drive("r1", [
    { type: "delta", requestId: "r1", sequence: 0, text: "   \n \n" },
    { type: "done", requestId: "r1" },
  ]);
  const plan = parseTaskPlan(run.preview);

  assert.equal(runHasResult(run), false);
  assert.equal(plan.ok, false);
  assert.match(aiActionStatusLine(run, EXTRACT), /without producing any text/);
});

test("a late delta from a superseded request cannot reach the live buffer", () => {
  const first = drive("r1", [
    { type: "delta", requestId: "r1", sequence: 0, text: "stale" },
    { type: "cancelled", requestId: "r1" },
  ]);
  const second = runWithDelta(first, "r1", " more stale");

  assert.equal(second.preview, "stale");
  assert.equal(second.phase, "cancelled");
  assert.equal(runWithDelta(startedRun("r2"), "r1", "wrong run").preview, "");
});

test("a terminal for a superseded request cannot terminate the live run", () => {
  const live = startedRun("r2");
  const untouched = runWithTerminal(live, { type: "done", requestId: "r1" });

  assert.equal(untouched.phase, "streaming");
  assert.equal(runWithTerminal(untouched, { type: "done", requestId: "r2" }).phase, "done");
});

test("a start failure only fails the request it belongs to", () => {
  const live = startedRun("r2");

  assert.equal(failedRun(live, "r1", "boom").phase, "streaming");
  const failed = failedRun(live, "r2", "AI completion is desktop-only.");
  assert.equal(failed.phase, "error");
  assert.equal(failed.error?.recoveryAction, "retry");
});

test("a result that outlived its note refuses to touch the document", () => {
  assert.equal(applyRefusal(TARGET, "note-1", TARGET.input), null);
  assert.match(applyRefusal(TARGET, null, TARGET.input) ?? "", /No note is open/);
  assert.match(applyRefusal(TARGET, "note-2", TARGET.input) ?? "", /different note/);
  assert.match(applyRefusal(TARGET, "note-1", null) ?? "", /gone/);
  assert.match(
    applyRefusal(TARGET, "note-1", "the writer kept typing") ?? "",
    /changed while this ran/,
  );
});

test("an untouched run is composing and offers nothing to retry or apply", () => {
  assert.equal(IDLE_RUN.phase, "composing");
  assert.equal(IDLE_RUN.preview, "");
  assert.equal(canRetryRun(IDLE_RUN), false);
  assert.equal(runHasResult(IDLE_RUN), false);
  assert.match(aiActionStatusLine(IDLE_RUN, REWRITE), /ready to run/);
  assert.match(aiActionStatusLine(startedRun("r1"), REWRITE), /Waiting for the first words/);
});
