import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_OUTPUT_BYTES,
  DEFAULT_TIMEOUT_MS,
  FAKE_MODEL,
  MAX_OUTPUT_BYTES,
  MAX_PLAYGROUND_PROMPT_BYTES,
  buildPlaygroundRequest,
  clampMaxOutputBytes,
  clampTemperatureMillis,
  defaultPlaygroundSelection,
  playgroundModelGroups,
  playgroundStatusLine,
  promptByteError,
  promptByteSize,
  startFailureRun,
  terminalRun,
  type PlaygroundTiming,
} from "../../../src/features/ai/playground-model";
import type { AiModelInventory } from "../../../src/features/ai/model-options";

function runningInventory(): AiModelInventory {
  return {
    ollamaStatus: {
      state: "running",
      version: "0.32.14",
      endpoint: "http://127.0.0.1:11434",
      managed: true,
      detail: null,
    },
    ollamaModels: [
      {
        name: "gemma3",
        sizeBytes: 3_338_801_804,
        modifiedAt: "2026-08-01T00:00:00Z",
        digest: "abc",
        parameterSize: "4.3B",
        quantizationLevel: "Q4_K_M",
      },
    ],
    remoteProviders: [],
    remoteCatalog: null,
  };
}

test("prompt byte bound counts UTF-8 bytes, not characters", () => {
  assert.equal(promptByteSize("aé", "🙂"), 1 + 2 + 4);
  assert.equal(promptByteError("a".repeat(1000), "b".repeat(1000)), null);
  const oversized = promptByteError("é".repeat(MAX_PLAYGROUND_PROMPT_BYTES / 2), "x");
  assert.ok(oversized !== null);
  assert.match(oversized, /1,048,576/);
  assert.match(oversized, /not be truncated/);
});

test("prompts exactly at the bound pass and one byte over fails", () => {
  const half = "x".repeat(MAX_PLAYGROUND_PROMPT_BYTES / 2);
  assert.equal(promptByteError(half, half), null);
  assert.ok(promptByteError(half, `${half}y`) !== null);
});

test("temperature input clamps to the seam's milli range and empty means default", () => {
  assert.equal(clampTemperatureMillis(""), null);
  assert.equal(clampTemperatureMillis("  "), null);
  assert.equal(clampTemperatureMillis("0.7"), 700);
  assert.equal(clampTemperatureMillis("0"), 0);
  assert.equal(clampTemperatureMillis("5"), 1000);
  assert.equal(clampTemperatureMillis("-1"), 0);
  assert.equal(clampTemperatureMillis("not a number"), null);
});

test("max output bytes clamps into the seam's accepted range", () => {
  assert.equal(clampMaxOutputBytes(""), DEFAULT_OUTPUT_BYTES);
  assert.equal(clampMaxOutputBytes("garbage"), DEFAULT_OUTPUT_BYTES);
  assert.equal(clampMaxOutputBytes("0"), DEFAULT_OUTPUT_BYTES);
  assert.equal(clampMaxOutputBytes("1"), 1);
  assert.equal(clampMaxOutputBytes(`${MAX_OUTPUT_BYTES * 10}`), MAX_OUTPUT_BYTES);
  assert.equal(clampMaxOutputBytes("2048"), 2048);
});

test("request construction captures the draft by value with a unique id", () => {
  const draft = {
    selection: { providerId: "ollama", modelId: "gemma3" },
    systemPrompt: "be terse",
    userPrompt: "hello",
    temperatureMillis: 700,
    maxOutputBytes: 2048,
  };
  const first = buildPlaygroundRequest(draft);
  const second = buildPlaygroundRequest(draft);
  assert.notEqual(first.requestId, second.requestId);
  assert.match(first.requestId, /^[A-Za-z0-9-]{1,128}$/);
  assert.equal(first.providerId, "ollama");
  assert.equal(first.modelId, "gemma3");
  assert.equal(first.systemPrompt, "be terse");
  assert.equal(first.userPrompt, "hello");
  assert.deepEqual(first.parameters, {
    maxOutputBytes: 2048,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    retryCount: 0,
    temperatureMillis: 700,
    topPMillis: null,
  });
});

test("playground groups always offer the fake provider and only runnable models", () => {
  const loading = playgroundModelGroups(null);
  assert.equal(loading.length, 1);
  assert.equal(loading[0]?.options[0]?.modelId, FAKE_MODEL.modelId);
  assert.equal(loading[0]?.options[0]?.available, true);

  const groups = playgroundModelGroups(runningInventory());
  const ollama = groups.find((group) => group.providerId === "ollama");
  assert.ok(ollama !== undefined);
  assert.ok(ollama.options.every((option) => option.available));
  assert.ok(ollama.options.some((option) => option.modelId === "gemma3"));
});

test("default selection prefers the stored default and falls back to fake", () => {
  const groups = playgroundModelGroups(runningInventory());
  assert.deepEqual(
    defaultPlaygroundSelection(groups, { providerId: "ollama", modelId: "gemma3" }),
    { providerId: "ollama", modelId: "gemma3" },
  );
  assert.deepEqual(
    defaultPlaygroundSelection(groups, { providerId: "ollama", modelId: "missing" }),
    FAKE_MODEL,
  );
  assert.deepEqual(defaultPlaygroundSelection(groups, null), FAKE_MODEL);
});

test("terminal events map onto the run states the UI renders", () => {
  assert.deepEqual(terminalRun({ type: "done", requestId: "r", usage: null }), {
    phase: "done",
    requestId: "r",
    usage: null,
  });
  assert.deepEqual(terminalRun({ type: "done", requestId: "r" }), {
    phase: "done",
    requestId: "r",
    usage: null,
  });
  assert.deepEqual(terminalRun({ type: "cancelled", requestId: "r" }), {
    phase: "cancelled",
    requestId: "r",
  });
  assert.deepEqual(terminalRun({ type: "timeout", requestId: "r" }), {
    phase: "timeout",
    requestId: "r",
  });
  const failed = terminalRun({
    type: "provider_error",
    requestId: "r",
    error: {
      providerId: "ollama",
      category: "unavailable_provider",
      message: "Ollama is not running",
      recoveryAction: "check_provider_status",
    },
  });
  assert.equal(failed.phase, "error");
});

test("status line reports duration, tokens, and rate when usage is present", () => {
  const timing: PlaygroundTiming = { startedAt: 0, firstDeltaAt: 500, finishedAt: 2500 };
  const done = playgroundStatusLine(
    { phase: "done", requestId: "r", usage: { inputTokens: 12, outputTokens: 40 } },
    timing,
  );
  assert.equal(done, "Done · 2.5s · 12 in / 40 out tokens · 20.0 tok/s");
});

test("status line degrades cleanly without usage and covers every terminal state", () => {
  const timing: PlaygroundTiming = { startedAt: 0, firstDeltaAt: null, finishedAt: 1200 };
  assert.equal(
    playgroundStatusLine({ phase: "done", requestId: "r", usage: null }, timing),
    "Done · 1.2s",
  );
  assert.equal(playgroundStatusLine({ phase: "idle" }, timing), "");
  assert.equal(playgroundStatusLine({ phase: "streaming", requestId: "r" }, timing), "Streaming…");
  assert.equal(playgroundStatusLine({ phase: "cancelled", requestId: "r" }, timing), "Cancelled");
  assert.equal(playgroundStatusLine({ phase: "timeout", requestId: "r" }, timing), "Timed out");
  assert.equal(
    playgroundStatusLine(startFailureRun("r", "boom"), timing),
    "Failed: boom",
  );
});
