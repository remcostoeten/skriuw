import assert from "node:assert/strict";
import { test } from "vitest";
import {
  connectedRun,
  failedRun,
  runWithDelta,
  runWithTerminal,
  startedRun,
  stoppedRun,
  type AiActionRun,
} from "@/features/ai/actions/editor-action-model";
import {
  AI_RUN_STALL_MS,
  aiErrorHint,
  aiRunElapsedLabel,
  aiRunIsAbortable,
  aiRunStallNote,
  aiRunSteps,
  aiRunTone,
  startErrorMessage,
  type AiRunStepState,
} from "@/features/ai/run/run-progress";

function states(run: AiActionRun): readonly AiRunStepState[] {
  return aiRunSteps(run, "ollama · llama3").map((step) => step.state);
}

test("the steps walk forward as the run does", () => {
  const sending = startedRun("r1", 0);
  assert.deepEqual(states(sending), ["active", "pending", "pending"]);

  const open = connectedRun(sending, "r1");
  assert.deepEqual(states(open), ["done", "active", "pending"]);

  const writing = runWithDelta(open, "r1", "Hello");
  assert.deepEqual(states(writing), ["done", "done", "active"]);

  const done = runWithTerminal(writing, { type: "done", requestId: "r1" });
  assert.deepEqual(states(done), ["done", "done", "done"]);
});

test("a failure marks the step it failed in, not the whole run", () => {
  const silent = connectedRun(startedRun("r1", 0), "r1");
  const timedOut = runWithTerminal(silent, { type: "timeout", requestId: "r1" });
  assert.deepEqual(states(timedOut), ["done", "failed", "pending"]);

  const halfWritten = runWithDelta(silent, "r1", "Half a sen");
  const broke = failedRun(halfWritten, "r1", "the provider stopped");
  assert.deepEqual(states(broke), ["done", "done", "failed"]);
});

test("stopping is not blamed on the provider", () => {
  const stopped = stoppedRun(runWithDelta(connectedRun(startedRun("r1", 0), "r1"), "r1", "x"));

  assert.deepEqual(states(stopped), ["done", "done", "stopped"]);
  assert.equal(aiRunIsAbortable(stopped), false);
});

test("a live run is the only abortable one", () => {
  assert.equal(aiRunIsAbortable(startedRun("r1", 0)), true);
  assert.equal(
    aiRunIsAbortable(runWithTerminal(startedRun("r1", 0), { type: "done", requestId: "r1" })),
    false,
  );
});

test("the provider names the step it is being waited on in", () => {
  assert.equal(
    aiRunSteps(startedRun("r1", 0), "groq · whisper")[0]?.label,
    "Sending to groq · whisper",
  );
  assert.equal(aiRunSteps(startedRun("r1", 0), null)[0]?.label, "Sending the request");
});

test("a quiet stream says which half it is quiet in, and only once it is late", () => {
  const sending = startedRun("r1", 0);
  assert.equal(aiRunStallNote(sending, AI_RUN_STALL_MS - 1), null);
  assert.match(aiRunStallNote(sending, AI_RUN_STALL_MS) ?? "", /opening the stream/);

  const open = connectedRun(sending, "r1");
  assert.match(aiRunStallNote(open, AI_RUN_STALL_MS) ?? "", /has not written anything yet/);

  const writing = runWithDelta(open, "r1", "words");
  assert.equal(aiRunStallNote(writing, AI_RUN_STALL_MS * 10), null);
  assert.equal(
    aiRunStallNote(runWithTerminal(writing, { type: "done", requestId: "r1" }), 1e9),
    null,
  );
});

test("elapsed time stays quiet under a second and coarsens after ten", () => {
  assert.equal(aiRunElapsedLabel(null, 5000), null);
  assert.equal(aiRunElapsedLabel(0, 900), null);
  assert.equal(aiRunElapsedLabel(0, 3400), "3.4s");
  assert.equal(aiRunElapsedLabel(0, 42_400), "42s");
});

test("every recovery action that has a next move offers one", () => {
  assert.equal(aiErrorHint(null), null);
  assert.match(
    aiErrorHint({
      providerId: "groq",
      category: "missing_credential",
      message: "No key",
      recoveryAction: "configure_credential",
    }) ?? "",
    /API key/,
  );
  assert.equal(
    aiErrorHint({
      providerId: "groq",
      category: "internal_failure",
      message: "boom",
      recoveryAction: "none",
    }),
    null,
  );
});

test("the card's tone follows the outcome, and an empty result is not a success", () => {
  const sending = startedRun("r1", 0);
  assert.equal(aiRunTone(sending), "live");
  assert.equal(aiRunTone(runWithDelta(connectedRun(sending, "r1"), "r1", "Hi")), "live");
  assert.equal(
    aiRunTone(
      runWithTerminal(runWithDelta(connectedRun(sending, "r1"), "r1", "Hi"), {
        type: "done",
        requestId: "r1",
      }),
    ),
    "result",
  );
  assert.equal(
    aiRunTone(runWithTerminal(connectedRun(sending, "r1"), { type: "done", requestId: "r1" })),
    "idle",
  );
  assert.equal(aiRunTone(failedRun(sending, "r1", "boom")), "failed");
  assert.equal(aiRunTone(stoppedRun(sending)), "stopped");
});

test("start failures are translated for the writer and carry a next move", () => {
  const active = startErrorMessage(new Error("AI request d2e6f0a1-0000 is already active"));
  assert.doesNotMatch(active.message, /d2e6|request id|AiStartError/);
  assert.equal(active.recoveryAction, "retry");
  assert.ok(aiErrorHint({ providerId: "editor", category: "internal_failure", ...active }));

  const invalid = startErrorMessage(new Error("AI completion request is invalid"));
  assert.doesNotMatch(invalid.message, /invalid/);
  assert.equal(invalid.recoveryAction, "reduce_request");

  const worker = startErrorMessage("AI completion worker is unavailable");
  assert.doesNotMatch(worker.message, /worker/);
  assert.equal(worker.recoveryAction, "check_provider_status");

  const browser = startErrorMessage(new Error("AI completion needs the desktop app."));
  assert.equal(browser.recoveryAction, "none");
  assert.equal(
    aiErrorHint({ providerId: "editor", category: "internal_failure", ...browser }),
    null,
  );
});

test("an aborted start is named as stopped, not as an exception", () => {
  const aborted = startErrorMessage(new DOMException("AI completion was cancelled.", "AbortError"));
  assert.doesNotMatch(aborted.message, /AbortError|DOMException/);
  assert.equal(aborted.recoveryAction, "retry");
});

test("unknown start reasons pass through unchanged", () => {
  assert.equal(startErrorMessage(new Error("disk on fire")).message, "disk on fire");
  assert.equal(startErrorMessage("plain string").message, "plain string");
  assert.equal(startErrorMessage(new Error("x")).recoveryAction, "retry");
});
