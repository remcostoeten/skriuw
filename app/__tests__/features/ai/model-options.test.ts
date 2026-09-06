import assert from "node:assert/strict";
import test from "node:test";
import {
  aiModelGroups,
  aiModelOptionFor,
  anyAiModelAvailable,
  describeAiSelection,
} from "../../../src/features/ai/model-options";
import type { AiModelInventory } from "../../../src/features/ai/model-options";
import { OLLAMA_MODEL_CATALOG } from "../../../src/features/ai/ollama-model-catalog";
import { remoteAiModelSummary } from "../../../src/features/ai/remote-ai-model";
import type {
  LocalAiModel,
  LocalAiRuntimeState,
  LocalAiStatus,
  RemoteAiModelDirectory,
  RemoteAiProviderState,
} from "../../../src/contracts/ai";

function ollamaStatus(state: LocalAiRuntimeState): LocalAiStatus {
  return { state, endpoint: "http://127.0.0.1:11434", managed: true };
}

function installedModel(name: string): LocalAiModel {
  return {
    name,
    sizeBytes: 2 * 1024 * 1024,
    modifiedAt: "2026-08-17T00:00:00Z",
    digest: name.padEnd(64, "a").slice(0, 64),
    parameterSize: "4B",
  };
}

function groqProvider(overrides: Partial<RemoteAiProviderState> = {}): RemoteAiProviderState {
  return {
    providerId: "groq",
    label: "Groq",
    destination: "api.groq.com",
    keyTier: "vault",
    acceptedDisclosureVersion: 1,
    currentDisclosureVersion: 1,
    supportsModelListing: true,
    ...overrides,
  };
}

const GROQ_MODEL = {
  providerId: "groq",
  modelId: "llama-3.3-70b-versatile",
  label: "Llama 3.3 70B",
  contextWindowTokens: 131_072,
  inputPriceMicrosPerMtok: 590_000,
  outputPriceMicrosPerMtok: 790_000,
};

const CATALOG: RemoteAiModelDirectory = {
  pricingAsOf: "2026-08-01",
  models: [{ ...GROQ_MODEL, source: "catalog" }],
};

function inventory(overrides: Partial<AiModelInventory> = {}): AiModelInventory {
  return {
    ollamaStatus: ollamaStatus("running"),
    ollamaModels: [],
    remoteProviders: [],
    remoteModels: null,
    ...overrides,
  };
}

test("installed Ollama models are selectable while uninstalled catalog picks stay visible but disabled", () => {
  const groups = aiModelGroups(
    inventory({ ollamaModels: [installedModel("gemma3:4b")] }),
  );
  const ollama = groups[0];
  assert.equal(ollama.providerId, "ollama");

  const installed = ollama.options.find((option) => option.modelId === "gemma3:4b");
  assert.deepEqual(installed, {
    providerId: "ollama",
    modelId: "gemma3:4b",
    label: "gemma3:4b",
    detail: "2.0 MB · 4B",
    available: true,
    disabledReason: null,
  });
  assert.equal(
    ollama.options.filter((option) => option.modelId === "gemma3:4b").length,
    1,
  );

  const uninstalled = ollama.options.filter((option) => option.modelId !== "gemma3:4b");
  assert.equal(uninstalled.length, OLLAMA_MODEL_CATALOG.length - 1);
  for (const option of uninstalled) {
    assert.equal(option.available, false);
    assert.equal(option.disabledReason, "Not installed — pull it in AI settings");
    assert.notEqual(option.detail, null);
  }
  assert.equal(anyAiModelAvailable(groups), true);
});

test("a stopped Ollama disables every local option with one runtime reason", () => {
  const groups = aiModelGroups(
    inventory({
      ollamaStatus: ollamaStatus("installed_stopped"),
      ollamaModels: [installedModel("gemma3:4b")],
    }),
  );
  for (const option of groups[0].options) {
    assert.equal(option.available, false);
    assert.equal(option.disabledReason, "Ollama is not running");
  }
  assert.equal(anyAiModelAvailable(groups), false);
});

test("an unknown Ollama state reads as still checking", () => {
  const groups = aiModelGroups(inventory({ ollamaStatus: null }));
  for (const option of groups[0].options) {
    assert.equal(option.disabledReason, "Checking Ollama…");
  }
});

test("a missing Ollama install names the install gap", () => {
  const groups = aiModelGroups(
    inventory({ ollamaStatus: ollamaStatus("not_installed") }),
  );
  for (const option of groups[0].options) {
    assert.equal(option.disabledReason, "Ollama is not installed");
  }
});

test("a consented remote provider with a stored key offers its catalog models", () => {
  const groups = aiModelGroups(
    inventory({ remoteProviders: [groqProvider()], remoteModels: CATALOG }),
  );
  const groq = groups.find((group) => group.providerId === "groq");
  assert.ok(groq);
  assert.deepEqual(groq.options, [
    {
      providerId: "groq",
      modelId: "llama-3.3-70b-versatile",
      label: "Llama 3.3 70B",
      detail: remoteAiModelSummary(GROQ_MODEL),
      available: true,
      disabledReason: null,
    },
  ]);
});

test("a remote provider without a key is disabled with the missing-key reason", () => {
  const groups = aiModelGroups(
    inventory({
      remoteProviders: [groqProvider({ keyTier: null })],
      remoteModels: CATALOG,
    }),
  );
  const groq = groups.find((group) => group.providerId === "groq");
  assert.ok(groq);
  assert.equal(groq.options[0].available, false);
  assert.equal(groq.options[0].disabledReason, "No API key saved");
});

test("stale or missing consent surfaces the matching disclosure reason", () => {
  const unaccepted = aiModelGroups(
    inventory({
      remoteProviders: [groqProvider({ acceptedDisclosureVersion: null })],
      remoteModels: CATALOG,
    }),
  );
  assert.equal(
    unaccepted.find((group) => group.providerId === "groq")?.options[0].disabledReason,
    "Disclosure not accepted",
  );

  const outdated = aiModelGroups(
    inventory({
      remoteProviders: [
        groqProvider({ acceptedDisclosureVersion: 1, currentDisclosureVersion: 2 }),
      ],
      remoteModels: CATALOG,
    }),
  );
  assert.equal(
    outdated.find((group) => group.providerId === "groq")?.options[0].disabledReason,
    "Disclosure changed since you accepted it",
  );
});

test("a remote provider with no catalog models is omitted entirely", () => {
  const groups = aiModelGroups(
    inventory({
      remoteProviders: [
        groqProvider({ providerId: "gemini", label: "Gemini", destination: "api.gemini" }),
      ],
      remoteModels: CATALOG,
    }),
  );
  assert.equal(groups.some((group) => group.providerId === "gemini"), false);
});

test("a selection resolves to its option and unknown selections resolve to nothing", () => {
  const groups = aiModelGroups(
    inventory({ ollamaModels: [installedModel("gemma3:4b")] }),
  );
  assert.equal(aiModelOptionFor(groups, null), null);
  assert.equal(
    aiModelOptionFor(groups, { providerId: "ollama", modelId: "gemma3:4b" })?.available,
    true,
  );
  assert.equal(
    aiModelOptionFor(groups, { providerId: "groq", modelId: "gemma3:4b" }),
    null,
  );
});

test("describing a selection prefers labels and falls back to raw ids", () => {
  const groups = aiModelGroups(
    inventory({ ollamaModels: [installedModel("gemma3:4b")] }),
  );
  assert.equal(describeAiSelection(groups, null), "No default model chosen");
  assert.equal(
    describeAiSelection(groups, { providerId: "ollama", modelId: "gemma3:4b" }),
    "Ollama · gemma3:4b",
  );
  assert.equal(
    describeAiSelection(groups, { providerId: "mystery", modelId: "model-x" }),
    "mystery · model-x",
  );
});
