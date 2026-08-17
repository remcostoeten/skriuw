import assert from "node:assert/strict";
import test from "node:test";
import {
  ollamaOwnershipLabel,
  ollamaProgressPercent,
  ollamaProgressText,
  ollamaStatusLabel,
} from "../../../src/features/ai/ollama-model";

test("projects runtime state and ownership honestly", () => {
  assert.equal(
    ollamaStatusLabel({
      state: "running",
      version: "0.32.5",
      endpoint: "http://127.0.0.1:11434/",
      managed: false,
    }),
    "Running · v0.32.5",
  );
  assert.match(
    ollamaOwnershipLabel({
      state: "running",
      version: "0.32.5",
      endpoint: "http://127.0.0.1:11434/",
      managed: false,
    }),
    /managed outside Skriuw/,
  );
});

test("formats bounded model progress for sighted and screen-reader output", () => {
  const progress = {
    type: "progress" as const,
    operationId: "pull-1",
    operation: "pull" as const,
    status: "pulling manifest",
    completedBytes: 512,
    totalBytes: 1024,
  };
  assert.equal(ollamaProgressPercent(progress), 50);
  assert.match(ollamaProgressText(progress), /512 Bytes of 1.0 KB/);
});

test("progress without a known total stays indeterminate instead of guessing", () => {
  const progress = {
    type: "progress" as const,
    operationId: "pull-1",
    operation: "pull" as const,
    status: "pulling manifest",
    completedBytes: 0,
    totalBytes: null,
  };
  assert.equal(ollamaProgressPercent(progress), null);
  assert.equal(ollamaProgressText(progress), "pulling manifest");
});

test("terminal progress reports the outcome of the operation it belongs to", () => {
  assert.equal(
    ollamaProgressText({ type: "complete", operationId: "install-1", operation: "install" }),
    "Ollama installed.",
  );
  assert.equal(
    ollamaProgressText({ type: "cancelled", operationId: "pull-1", operation: "pull" }),
    "Model pull cancelled.",
  );
});
