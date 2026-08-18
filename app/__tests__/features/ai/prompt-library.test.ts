import assert from "node:assert/strict";
import test from "node:test";
import { BUILT_IN_PROMPTS } from "../../../src/features/ai/built-in-prompts";
import {
  MAX_PROMPT_SYSTEM_BYTES,
  duplicatePromptDraft,
  newPromptDraft,
  promptDraftError,
  promptDraftFrom,
  promptFromDraft,
  promptLibraryEntries,
} from "../../../src/features/ai/prompt-library";
import type { WorkspacePrompt } from "../../../src/contracts/workspace";

function prompt(overrides: Partial<WorkspacePrompt> = {}): WorkspacePrompt {
  return {
    id: "prompt-1",
    name: "My rewrite",
    systemPrompt: "Rewrite it my way.",
    inputShape: "selection",
    parameters: { temperatureMillis: 450, maxOutputBytes: 65_536 },
    builtInId: null,
    createdAt: 10,
    updatedAt: 10,
    ...overrides,
  };
}

function library(...prompts: WorkspacePrompt[]): ReadonlyMap<string, WorkspacePrompt> {
  return new Map(prompts.map((entry) => [entry.id, entry]));
}

test("an untouched library is exactly the shipped prompts", () => {
  const entries = promptLibraryEntries(library());
  assert.equal(entries.length, BUILT_IN_PROMPTS.length);
  assert.deepEqual(
    entries.map((entry) => entry.origin),
    BUILT_IN_PROMPTS.map(() => "built-in"),
  );
  assert.deepEqual(
    entries.map((entry) => entry.name),
    BUILT_IN_PROMPTS.map((builtIn) => builtIn.name),
  );
});

test("a stored copy shadows its built-in in place and reports itself as modified", () => {
  const entries = promptLibraryEntries(
    library(prompt({ builtInId: "rewrite", name: "Rewrite", systemPrompt: "House style." })),
  );

  assert.equal(entries.length, BUILT_IN_PROMPTS.length);
  const rewrite = entries.find((entry) => entry.builtInId === "rewrite");
  assert.ok(rewrite);
  assert.equal(rewrite.origin, "customised");
  assert.equal(rewrite.systemPrompt, "House style.");
  assert.equal(rewrite.promptId, "prompt-1");
  assert.equal(entries.indexOf(rewrite), 0, "the shadow keeps the built-in's place");
});

test("a shipped update reaches untouched built-ins and never overwrites a shadow", () => {
  const shipped = BUILT_IN_PROMPTS[0];
  const untouched = BUILT_IN_PROMPTS[1];
  assert.ok(shipped && untouched);
  const entries = promptLibraryEntries(
    library(prompt({ builtInId: shipped.id, systemPrompt: "Mine, not yours." })),
  );

  const shadowed = entries.find((entry) => entry.builtInId === shipped.id);
  const fresh = entries.find((entry) => entry.builtInId === untouched.id);
  assert.equal(shadowed?.systemPrompt, "Mine, not yours.");
  assert.equal(fresh?.systemPrompt, untouched.systemPrompt);
  assert.equal(fresh?.origin, "built-in");
});

test("a shadow of a built-in that no longer ships survives as an ordinary prompt", () => {
  const entries = promptLibraryEntries(
    library(prompt({ builtInId: "retired-action", name: "Retired" })),
  );

  const kept = entries.find((entry) => entry.promptId === "prompt-1");
  assert.ok(kept);
  assert.equal(kept.origin, "user");
  assert.equal(kept.builtInId, null);
  assert.equal(entries.length, BUILT_IN_PROMPTS.length + 1);
});

test("user prompts follow the built-ins in creation order", () => {
  const entries = promptLibraryEntries(
    library(
      prompt({ id: "prompt-b", name: "Second", createdAt: 20 }),
      prompt({ id: "prompt-a", name: "First", createdAt: 10 }),
    ),
  );

  assert.deepEqual(
    entries.slice(BUILT_IN_PROMPTS.length).map((entry) => entry.name),
    ["First", "Second"],
  );
});

test("editing a built-in produces a draft that shadows it", () => {
  const builtIn = BUILT_IN_PROMPTS[0];
  assert.ok(builtIn);
  const entry = promptLibraryEntries(library())[0];
  assert.ok(entry);

  const draft = promptDraftFrom(entry, "generated-id", 99);
  assert.equal(draft.id, "generated-id");
  assert.equal(draft.builtInId, builtIn.id);
  assert.equal(draft.systemPrompt, builtIn.systemPrompt);

  const saved = promptFromDraft(draft, 100);
  assert.equal(saved.builtInId, builtIn.id);
  assert.equal(saved.createdAt, 99);
  assert.equal(saved.updatedAt, 100);
});

test("editing a stored prompt keeps its place in the library", () => {
  const stored = prompt({ createdAt: 10 });
  const entry = promptLibraryEntries(library(stored)).at(-1);
  assert.ok(entry);

  const saved = promptFromDraft(promptDraftFrom(entry, "unused-id", 500), 500);
  assert.equal(saved.id, stored.id);
  assert.equal(saved.createdAt, 10, "an edit must not restamp creation and reorder the list");
  assert.equal(saved.updatedAt, 500);
});

test("duplicating a built-in produces an independent prompt", () => {
  const entry = promptLibraryEntries(library())[0];
  assert.ok(entry);

  const draft = duplicatePromptDraft(entry, "generated-id", 99);
  assert.equal(draft.builtInId, null);
  assert.equal(draft.name, `${entry.name} copy`);
  assert.equal(promptFromDraft(draft, 100).builtInId, null);
});

test("a draft is rejected with an actionable message before it reaches the backend", () => {
  const blank = newPromptDraft("generated-id", 1);
  assert.match(promptDraftError(blank) ?? "", /name/i);

  assert.match(
    promptDraftError({ ...blank, name: "Named" }) ?? "",
    /system prompt/i,
  );

  const filled = { ...blank, name: "Named", systemPrompt: "Do the thing." };
  assert.equal(promptDraftError(filled), null);

  assert.match(
    promptDraftError({ ...filled, systemPrompt: "x".repeat(MAX_PROMPT_SYSTEM_BYTES + 1) }) ?? "",
    /limit/i,
  );
  assert.match(promptDraftError({ ...filled, temperature: "3" }) ?? "", /temperature/i);
  assert.match(promptDraftError({ ...filled, temperature: "abc" }) ?? "", /temperature/i);
  assert.match(promptDraftError({ ...filled, maxOutputBytes: "0" }) ?? "", /output/i);
});

test("a draft's parameters survive the round trip through a stored prompt", () => {
  const draft = {
    ...newPromptDraft("generated-id", 1),
    name: "  Trimmed  ",
    systemPrompt: "  Do it.  ",
    temperature: "0.45",
    maxOutputBytes: "8192",
    inputShape: "note" as const,
  };

  const saved = promptFromDraft(draft, 2);
  assert.equal(saved.name, "Trimmed");
  assert.equal(saved.systemPrompt, "Do it.");
  assert.equal(saved.inputShape, "note");
  assert.deepEqual(saved.parameters, { temperatureMillis: 450, maxOutputBytes: 8192 });

  const blankTemperature = promptFromDraft({ ...draft, temperature: "" }, 2);
  assert.equal(blankTemperature.parameters.temperatureMillis, null);
});
