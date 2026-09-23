import assert from "node:assert/strict";
import { test } from "vitest";
import type { AiCompletionEvent, AiCompletionRequest } from "@/contracts/ai";
import type { AiCompletionHandle } from "@/features/ai/completion/completion-bridge";
import {
  createRunSession,
  type FlushScheduler,
  type RunRepair,
  type StartCompletion,
} from "@/features/ai/run/run-session";

const TEMPLATE: AiCompletionRequest = {
  requestId: "template",
  providerId: "fake",
  modelId: "echo",
  systemPrompt: "system",
  userPrompt: "user",
  parameters: {
    maxOutputBytes: 1024,
    timeoutMs: 1000,
    retryCount: 0,
    temperatureMillis: null,
    topPMillis: null,
  },
};

type Started = {
  request: AiCompletionRequest;
  origin: string;
  emit: (event: AiCompletionEvent) => void;
  resolve: () => void;
  reject: (reason: unknown) => void;
  handle: AiCompletionHandle & { cancelled: number; disposed: number };
};

/**
 * A seam that hands every start back to the test: the promise resolves or
 * rejects only when told to, and the handle counts what was asked of it.
 */
function fakeSeam() {
  const starts: Started[] = [];
  const startCompletion: StartCompletion = (request, origin, onEvent) =>
    new Promise<AiCompletionHandle>((resolve, reject) => {
      const handle = {
        cancelled: 0,
        disposed: 0,
        cancel() {
          handle.cancelled += 1;
          return Promise.resolve(true);
        },
        dispose() {
          handle.disposed += 1;
        },
      };
      starts.push({
        request,
        origin,
        emit: onEvent,
        resolve: () => resolve(handle),
        reject,
        handle,
      });
    });
  return { starts, startCompletion };
}

function manualFlush() {
  let pending: (() => void) | null = null;
  const scheduleFlush: FlushScheduler = (flush) => {
    pending = flush;
    return () => {
      if (pending === flush) {
        pending = null;
      }
    };
  };
  return {
    scheduleFlush,
    flush() {
      const flush = pending;
      pending = null;
      flush?.();
    },
    isPending: () => pending !== null,
  };
}

function ids() {
  let next = 0;
  return () => `req-${(next += 1)}`;
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function session(
  seam: ReturnType<typeof fakeSeam>,
  frames = manualFlush(),
  repair: RunRepair | undefined = undefined,
) {
  const controller = new AbortController();
  return createRunSession({
    origin: "editor:test",
    signal: controller.signal,
    repair,
    startCompletion: seam.startCompletion,
    scheduleFlush: frames.scheduleFlush,
    mintRequestId: ids(),
    now: () => 0,
  });
}

test("two fires with the same template go out under distinct ids and a late first handle is dropped", async () => {
  const seam = fakeSeam();
  const run = session(seam);

  run.fire(TEMPLATE);
  run.fire(TEMPLATE);

  assert.equal(seam.starts.length, 2);
  const [first, second] = seam.starts as [Started, Started];
  assert.notEqual(first.request.requestId, second.request.requestId);
  assert.notEqual(first.request.requestId, TEMPLATE.requestId);
  assert.equal(run.getRun().requestId, second.request.requestId);

  first.resolve();
  await settle();
  assert.equal(first.handle.disposed, 1);
  assert.equal(run.getRun().stage, "sending");

  second.resolve();
  await settle();
  assert.equal(second.handle.disposed, 0);
  assert.equal(run.getRun().stage, "waiting");
});

test("cancel before the start resolves cancels the handle on resolution and the run reads cancelled", async () => {
  const seam = fakeSeam();
  const run = session(seam);
  run.fire(TEMPLATE);
  const [start] = seam.starts as [Started];

  run.cancel();
  assert.equal(run.getRun().phase, "cancelled");
  assert.equal(start.handle.cancelled, 0);

  start.resolve();
  await settle();
  assert.equal(start.handle.cancelled, 1);
  assert.equal(run.getRun().phase, "cancelled");
  assert.equal(run.getRun().stage, "settled");
});

test("retry after a failure re-sends the same template under a new id", async () => {
  const seam = fakeSeam();
  const run = session(seam);
  run.fire(TEMPLATE);
  const [first] = seam.starts as [Started];

  first.reject(new Error("AI completion worker is unavailable"));
  await settle();
  assert.equal(run.getRun().phase, "error");
  assert.equal(run.getRun().error?.message, "The AI service in this app is not running.");
  assert.equal(run.getRun().error?.recoveryAction, "check_provider_status");

  run.retry();
  assert.equal(seam.starts.length, 2);
  const second = seam.starts[1] as Started;
  assert.notEqual(second.request.requestId, first.request.requestId);
  assert.equal(second.request.userPrompt, first.request.userPrompt);
  assert.equal(second.origin, "editor:test");
  assert.equal(run.getRun().phase, "streaming");
  assert.equal(run.getRun().requestId, second.request.requestId);
});

test("retry does nothing while streaming or before a first run", () => {
  const seam = fakeSeam();
  const run = session(seam);
  run.retry();
  assert.equal(seam.starts.length, 0);

  run.fire(TEMPLATE);
  run.retry();
  assert.equal(seam.starts.length, 1);
});

test("deltas are batched per frame and none reach state after dispose", async () => {
  const seam = fakeSeam();
  const frames = manualFlush();
  const run = session(seam, frames);
  const seen: string[] = [];
  run.subscribe(() => seen.push(run.getRun().preview));

  run.fire(TEMPLATE);
  const [start] = seam.starts as [Started];
  start.resolve();
  await settle();

  start.emit({ type: "delta", requestId: start.request.requestId, sequence: 0, text: "Hel" });
  start.emit({ type: "delta", requestId: start.request.requestId, sequence: 1, text: "lo" });
  assert.equal(run.getRun().preview, "");
  assert.equal(frames.isPending(), true);
  frames.flush();
  assert.equal(run.getRun().preview, "Hello");

  start.emit({ type: "delta", requestId: start.request.requestId, sequence: 2, text: " there" });
  run.dispose();
  assert.equal(frames.isPending(), false);
  start.emit({ type: "delta", requestId: start.request.requestId, sequence: 3, text: "!" });
  start.emit({ type: "done", requestId: start.request.requestId });
  frames.flush();

  assert.equal(run.getRun().preview, "Hello");
  assert.equal(run.getRun().phase, "streaming");
  assert.equal(seen.at(-1), "Hello");
  assert.equal(start.handle.disposed, 1);
});

test("a terminal flushes what was buffered before settling the run", async () => {
  const seam = fakeSeam();
  const frames = manualFlush();
  const run = session(seam, frames);
  run.fire(TEMPLATE);
  const [start] = seam.starts as [Started];
  start.resolve();
  await settle();

  start.emit({ type: "delta", requestId: start.request.requestId, sequence: 0, text: "All" });
  start.emit({ type: "done", requestId: start.request.requestId });

  assert.equal(run.getRun().preview, "All");
  assert.equal(run.getRun().phase, "done");
  assert.equal(frames.isPending(), false);
});

test("dispose releases the consumer and the handle, and a later start is ignored", async () => {
  const seam = fakeSeam();
  const run = session(seam);
  run.fire(TEMPLATE);
  const [start] = seam.starts as [Started];
  let notified = 0;
  run.subscribe(() => (notified += 1));

  run.dispose();
  assert.equal(run.isDisposed(), true);
  start.resolve();
  await settle();
  assert.equal(start.handle.disposed, 1);
  assert.equal(run.getRun().stage, "sending");
  assert.equal(notified, 0);

  run.fire(TEMPLATE);
  assert.equal(seam.starts.length, 1);
});

test("a start rejection after a newer fire is ignored", async () => {
  const seam = fakeSeam();
  const run = session(seam);
  run.fire(TEMPLATE);
  run.fire(TEMPLATE);
  const [first, second] = seam.starts as [Started, Started];

  first.reject(new Error("AI request req-1 is already active"));
  await settle();
  assert.equal(run.getRun().phase, "streaming");
  assert.equal(run.getRun().requestId, second.request.requestId);
});

test("an aborted start reads as a stopped run with a retry hint, never as a request id", async () => {
  const seam = fakeSeam();
  const run = session(seam);
  run.fire(TEMPLATE);
  const [start] = seam.starts as [Started];

  start.reject(new DOMException("AI completion was cancelled.", "AbortError"));
  await settle();
  assert.equal(run.getRun().phase, "error");
  assert.doesNotMatch(run.getRun().error?.message ?? "", /req-/);
  assert.equal(run.getRun().error?.recoveryAction, "retry");
});

async function finish(start: Started, text: string): Promise<void> {
  start.resolve();
  await settle();
  start.emit({ type: "delta", requestId: start.request.requestId, sequence: 0, text });
  start.emit({ type: "done", requestId: start.request.requestId });
}

test("a reply the repair rejects is held back and re-sent once, and the second reply stands", async () => {
  const seam = fakeSeam();
  const seen: string[] = [];
  const run = session(seam, manualFlush(), (preview, request) => {
    seen.push(preview);
    return Promise.resolve({ ...request, userPrompt: `${request.userPrompt} fix` });
  });
  run.fire(TEMPLATE);

  await finish(seam.starts[0] as Started, "broken");
  assert.equal(run.getRun().phase, "streaming");
  await settle();

  assert.equal(seam.starts.length, 2);
  const second = seam.starts[1] as Started;
  assert.equal(second.request.userPrompt, "user fix");
  assert.equal(run.getRun().preview, "");

  await finish(second, "still broken");
  await settle();
  assert.deepEqual(seen, ["broken"]);
  assert.equal(seam.starts.length, 2);
  assert.equal(run.getRun().phase, "done");
  assert.equal(run.getRun().preview, "still broken");
});

test("a reply the repair accepts settles without a second request", async () => {
  const seam = fakeSeam();
  const run = session(seam, manualFlush(), () => Promise.resolve(null));
  run.fire(TEMPLATE);

  await finish(seam.starts[0] as Started, "fine");
  await settle();

  assert.equal(seam.starts.length, 1);
  assert.equal(run.getRun().phase, "done");
  assert.equal(run.getRun().preview, "fine");
});

test("a repair that throws leaves the reply standing", async () => {
  const seam = fakeSeam();
  const run = session(seam, manualFlush(), () => Promise.reject(new Error("renderer crashed")));
  run.fire(TEMPLATE);

  await finish(seam.starts[0] as Started, "kept");
  await settle();

  assert.equal(seam.starts.length, 1);
  assert.equal(run.getRun().phase, "done");
});

test("stopping while the repair is looking drops its answer", async () => {
  const seam = fakeSeam();
  let release: () => void = () => undefined;
  const run = session(
    seam,
    manualFlush(),
    (_preview, request) =>
      new Promise((resolve) => {
        release = () => resolve(request);
      }),
  );
  run.fire(TEMPLATE);

  await finish(seam.starts[0] as Started, "broken");
  run.cancel();
  release();
  await settle();

  assert.equal(seam.starts.length, 1);
  assert.equal(run.getRun().phase, "cancelled");
});

test("a manual retry re-sends the original request and may be repaired again", async () => {
  const seam = fakeSeam();
  let calls = 0;
  const run = session(seam, manualFlush(), (_preview, request) => {
    calls += 1;
    return Promise.resolve({ ...request, userPrompt: "repair" });
  });
  run.fire(TEMPLATE);
  await finish(seam.starts[0] as Started, "broken");
  await settle();
  await finish(seam.starts[1] as Started, "broken again");
  await settle();

  run.retry();
  assert.equal((seam.starts[2] as Started).request.userPrompt, "user");
  await finish(seam.starts[2] as Started, "broken thrice");
  await settle();

  assert.equal(calls, 2);
  assert.equal((seam.starts[3] as Started).request.userPrompt, "repair");
});
