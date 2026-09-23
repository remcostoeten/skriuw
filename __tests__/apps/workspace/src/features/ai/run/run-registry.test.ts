import assert from "node:assert/strict";
import { test } from "vitest";
import type { AiCompletionRequest } from "@/contracts/ai";
import type { AiCompletionHandle } from "@/features/ai/completion/completion-bridge";
import { aiEditorAction } from "@/features/ai/actions/editor-actions";
import {
  aiRunForNote,
  clearAiRuns,
  endAiRun,
  registerAiRun,
  subscribeAiRuns,
  type RegisteredAiRun,
} from "@/features/ai/run/run-registry";
import { createRunSession } from "@/features/ai/run/run-session";

const REQUEST: AiCompletionRequest = {
  requestId: "template",
  providerId: "fake",
  modelId: "echo",
  systemPrompt: "s",
  userPrompt: "u",
  parameters: {
    maxOutputBytes: 1,
    timeoutMs: 1,
    retryCount: 0,
    temperatureMillis: null,
    topPMillis: null,
  },
};

function entry(noteId: string, signal: AbortSignal, cancelled: number[] = []): RegisteredAiRun {
  const action = aiEditorAction("summarize");
  assert.ok(action);
  const session = createRunSession({
    origin: "editor:test",
    signal,
    scheduleFlush: () => () => undefined,
    startCompletion: () =>
      new Promise<AiCompletionHandle>((resolve) =>
        resolve({
          cancel: () => {
            cancelled.push(1);
            return Promise.resolve(true);
          },
          dispose: () => undefined,
        }),
      ),
  });
  return {
    action,
    target: { noteId, from: 0, to: 0, input: "text" },
    request: REQUEST,
    modelLabel: "fake · echo",
    session,
  };
}

test.beforeEach(() => clearAiRuns());

test("a run is found under its note and nowhere else", () => {
  const owner = new AbortController();
  const run = entry("note-a", owner.signal);
  registerAiRun(run, { signal: owner.signal });

  assert.equal(aiRunForNote("note-a"), run);
  assert.equal(aiRunForNote("note-b"), null);
  assert.equal(aiRunForNote(null), null);
});

test("a second run on the same note replaces and disposes the first", () => {
  const owner = new AbortController();
  const first = entry("note-a", owner.signal);
  const second = entry("note-a", owner.signal);
  registerAiRun(first, { signal: owner.signal });
  registerAiRun(second, { signal: owner.signal });

  assert.equal(aiRunForNote("note-a"), second);
  assert.equal(first.session.isDisposed(), true);
  assert.equal(second.session.isDisposed(), false);
});

test("ending a run disposes it and only the run it names", () => {
  const owner = new AbortController();
  const first = entry("note-a", owner.signal);
  registerAiRun(first, { signal: owner.signal });
  const second = entry("note-a", owner.signal);
  registerAiRun(second, { signal: owner.signal });

  endAiRun("note-a", first);
  assert.equal(aiRunForNote("note-a"), second);

  endAiRun("note-a", second);
  assert.equal(aiRunForNote("note-a"), null);
  assert.equal(second.session.isDisposed(), true);
});

test("subscribers hear registrations and endings once each", () => {
  const owner = new AbortController();
  let heard = 0;
  const unsubscribe = subscribeAiRuns(() => (heard += 1));
  registerAiRun(entry("note-a", owner.signal), { signal: owner.signal });
  endAiRun("note-a");
  endAiRun("note-a");
  unsubscribe();
  registerAiRun(entry("note-b", owner.signal), { signal: owner.signal });

  assert.equal(heard, 2);
});

test("an owner's abort ends its runs and reports the ones still streaming", async () => {
  const owner = new AbortController();
  const cancelled: number[] = [];
  const streaming = entry("note-a", owner.signal, cancelled);
  const idle = entry("note-b", owner.signal);
  const stopped: string[] = [];
  registerAiRun(streaming, {
    signal: owner.signal,
    onStopped: (run) => stopped.push(run.target.noteId),
  });
  registerAiRun(idle, {
    signal: owner.signal,
    onStopped: (run) => stopped.push(run.target.noteId),
  });
  streaming.session.fire(REQUEST);
  await new Promise((resolve) => setTimeout(resolve, 0));

  owner.abort();

  assert.equal(aiRunForNote("note-a"), null);
  assert.equal(aiRunForNote("note-b"), null);
  assert.deepEqual(stopped, ["note-a"]);
  assert.equal(cancelled.length, 1);
  assert.equal(streaming.session.getRun().phase, "cancelled");
});

test("a run registered under an already aborted owner never appears", () => {
  const owner = new AbortController();
  owner.abort();
  const run = entry("note-a", owner.signal);
  registerAiRun(run, { signal: owner.signal });

  assert.equal(aiRunForNote("note-a"), null);
  assert.equal(run.session.isDisposed(), true);
});

test("an abort after the run was replaced leaves the replacement alone", () => {
  const first = new AbortController();
  const second = new AbortController();
  registerAiRun(entry("note-a", first.signal), { signal: first.signal });
  const replacement = entry("note-a", second.signal);
  registerAiRun(replacement, { signal: second.signal });

  first.abort();
  assert.equal(aiRunForNote("note-a"), replacement);
});
