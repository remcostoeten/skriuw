import assert from "node:assert/strict";
import test from "node:test";
import {
  changeAiModelSelection,
  parseAiModelSelection,
  readAiModelSelection,
  resolveAiModel,
  sameAiModel,
} from "../../../src/features/ai/model-selection";
import { DEFAULT_WORKSPACE_SETTINGS } from "../../../src/features/settings/settings-model";
import type { WorkspaceSettings } from "../../../src/contracts/workspace";

function settingsWith(aiModel: unknown): WorkspaceSettings {
  return { ...DEFAULT_WORKSPACE_SETTINGS, aiModel };
}

test("parsing rejects everything that is not a well-formed selection object", () => {
  assert.equal(parseAiModelSelection(undefined), null);
  assert.equal(parseAiModelSelection(null), null);
  assert.equal(parseAiModelSelection("ollama:gemma3:4b"), null);
  assert.equal(parseAiModelSelection(42), null);
  assert.equal(parseAiModelSelection(["ollama", "gemma3:4b"]), null);
  assert.equal(parseAiModelSelection({ providerId: "ollama" }), null);
  assert.equal(parseAiModelSelection({ modelId: "gemma3:4b" }), null);
  assert.equal(parseAiModelSelection({ providerId: "", modelId: "gemma3:4b" }), null);
  assert.equal(parseAiModelSelection({ providerId: "ollama", modelId: "" }), null);
  assert.deepEqual(parseAiModelSelection({ providerId: "ollama", modelId: "gemma3:4b" }), {
    providerId: "ollama",
    modelId: "gemma3:4b",
  });
});

test("reading the stored selection tolerates malformed settings values", () => {
  assert.equal(readAiModelSelection(DEFAULT_WORKSPACE_SETTINGS), null);
  assert.equal(readAiModelSelection(settingsWith("broken")), null);
  assert.deepEqual(
    readAiModelSelection(settingsWith({ providerId: "groq", modelId: "llama-3.3-70b" })),
    { providerId: "groq", modelId: "llama-3.3-70b" },
  );
});

test("changing the selection adds or replaces the aiModel key", () => {
  const added = changeAiModelSelection(DEFAULT_WORKSPACE_SETTINGS, {
    providerId: "ollama",
    modelId: "gemma3:4b",
  });
  assert.deepEqual(added.aiModel, { providerId: "ollama", modelId: "gemma3:4b" });

  const replaced = changeAiModelSelection(added, {
    providerId: "groq",
    modelId: "llama-3.3-70b",
  });
  assert.deepEqual(replaced.aiModel, { providerId: "groq", modelId: "llama-3.3-70b" });
});

test("clearing an absent selection returns the same settings object", () => {
  assert.equal(
    changeAiModelSelection(DEFAULT_WORKSPACE_SETTINGS, null),
    DEFAULT_WORKSPACE_SETTINGS,
  );
});

test("clearing a stored selection drops the key instead of storing null", () => {
  const stored = settingsWith({ providerId: "ollama", modelId: "gemma3:4b" });
  const cleared = changeAiModelSelection(stored, null);
  assert.equal("aiModel" in cleared, false);
  assert.notEqual(cleared, stored);
});

test("selections compare by provider and model, treating null as a distinct state", () => {
  const ollama = { providerId: "ollama", modelId: "gemma3:4b" };
  assert.equal(sameAiModel(null, null), true);
  assert.equal(sameAiModel(ollama, null), false);
  assert.equal(sameAiModel(null, ollama), false);
  assert.equal(sameAiModel(ollama, { providerId: "ollama", modelId: "gemma3:4b" }), true);
  assert.equal(sameAiModel(ollama, { providerId: "groq", modelId: "gemma3:4b" }), false);
  assert.equal(sameAiModel(ollama, { providerId: "ollama", modelId: "llama3.2:1b" }), false);
});

test("an explicit override wins over the stored default without touching settings", () => {
  const stored = settingsWith({ providerId: "ollama", modelId: "gemma3:4b" });
  const frozen = Object.freeze({ ...stored });
  const override = { providerId: "groq", modelId: "llama-3.3-70b" };
  assert.equal(resolveAiModel(override, frozen), override);
  assert.deepEqual(frozen.aiModel, { providerId: "ollama", modelId: "gemma3:4b" });
});

test("without an override the stored default resolves, and nothing resolves to null", () => {
  const stored = settingsWith({ providerId: "ollama", modelId: "gemma3:4b" });
  assert.deepEqual(resolveAiModel(null, stored), {
    providerId: "ollama",
    modelId: "gemma3:4b",
  });
  assert.equal(resolveAiModel(null, DEFAULT_WORKSPACE_SETTINGS), null);
});
