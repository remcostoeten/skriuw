import assert from "node:assert/strict";
import test from "node:test";
import { BUILT_IN_PROMPTS } from "../../../src/features/ai/built-in-prompts";
import {
  AI_EDITOR_ACTIONS,
  MAX_AI_ACTION_INPUT_BYTES,
  aiActionInputError,
  aiActionInstructionError,
  aiActionOrigin,
  aiActionUserPrompt,
  aiEditorAction,
  aiNoteActions,
  aiSelectionActions,
  buildAiActionRequest,
  type AiEditorAction,
} from "../../../src/features/ai/editor-actions";

function action(id: string): AiEditorAction {
  const found = aiEditorAction(id);
  assert.ok(found, `expected an action named ${id}`);
  return found;
}

test("every action names a prompt the shipped library actually contains", () => {
  const shipped = new Set(BUILT_IN_PROMPTS.map((prompt) => prompt.id));
  for (const candidate of AI_EDITOR_ACTIONS) {
    assert.ok(
      shipped.has(candidate.promptId),
      `action ${candidate.id} points at missing prompt ${candidate.promptId}`,
    );
  }
});

test("action ids are unique and every run records its own origin", () => {
  const ids = new Set<string>();
  const origins = new Set<string>();
  for (const candidate of AI_EDITOR_ACTIONS) {
    assert.equal(ids.has(candidate.id), false, `duplicate action ${candidate.id}`);
    ids.add(candidate.id);
    const origin = aiActionOrigin(candidate);
    assert.equal(origin, `editor:${candidate.id}`);
    assert.equal(origins.has(origin), false);
    origins.add(origin);
  }
});

test("the catalogue covers the v1-parity selection and note actions", () => {
  const selection = aiSelectionActions().map((candidate) => candidate.id);
  for (const expected of [
    "rewrite",
    "shorten",
    "lengthen",
    "translate",
    "improve",
    "fix-grammar",
    "change-tone",
    "simplify",
    "custom",
  ]) {
    assert.ok(selection.includes(expected), `missing selection action ${expected}`);
  }
  const note = aiNoteActions().map((candidate) => candidate.id);
  for (const expected of [
    "continue",
    "summarize",
    "extract-tasks",
    "suggest-tags",
    "title",
    "outline",
  ]) {
    assert.ok(note.includes(expected), `missing note action ${expected}`);
  }
  assert.equal(
    selection.some((id) => note.includes(id)),
    false,
  );
});

test("extraction actions are the only ones producing a reviewable plan", () => {
  assert.equal(action("extract-tasks").outcome, "tasks");
  assert.equal(action("suggest-tags").outcome, "tags");
  assert.equal(action("rewrite").outcome, "text");
  assert.equal(action("title").outcome, "title");
});

test("an empty input is refused with something the writer can act on", () => {
  assert.equal(aiActionInputError(action("rewrite"), "   "), "Select some text first.");
  assert.match(aiActionInputError(action("continue"), "") ?? "", /Write something/);
  assert.equal(aiActionInputError(action("summarize"), ""), "This note is empty.");
  assert.equal(aiActionInputError(action("rewrite"), "some prose"), null);
});

test("an oversized selection is refused rather than silently truncated", () => {
  const oversized = "x".repeat(MAX_AI_ACTION_INPUT_BYTES + 1);
  const message = aiActionInputError(action("rewrite"), oversized);
  assert.ok(message);
  assert.match(message, /will not be truncated/);
  assert.equal(aiActionInputError(action("rewrite"), "x".repeat(MAX_AI_ACTION_INPUT_BYTES)), null);
});

test("multi-byte input is bounded by bytes, not characters", () => {
  const justOver = "é".repeat(MAX_AI_ACTION_INPUT_BYTES / 2 + 1);
  assert.equal(justOver.length < MAX_AI_ACTION_INPUT_BYTES, true);
  assert.ok(aiActionInputError(action("rewrite"), justOver));
});

test("a required instruction is enforced and an optional one is not", () => {
  assert.equal(aiActionInstructionError(action("custom"), "  "), "Instruction is required.");
  assert.equal(aiActionInstructionError(action("custom"), "make it rhyme"), null);
  assert.equal(aiActionInstructionError(action("translate"), ""), null);
  assert.equal(aiActionInstructionError(action("rewrite"), "ignored"), null);
  assert.ok(aiActionInstructionError(action("translate"), "x".repeat(501)));
});

test("the user prompt is the input alone until an instruction is given", () => {
  const translate = action("translate");
  assert.equal(aiActionUserPrompt(translate, "hello", "  "), "hello");
  assert.equal(
    aiActionUserPrompt(translate, "hello", " Frysk "),
    "Target language: Frysk\n\n---\n\nhello",
  );
  assert.equal(aiActionUserPrompt(action("rewrite"), "hello", "sneaky"), "hello");
});

test("a built request carries the prompt's own bounds and never retries", () => {
  const request = buildAiActionRequest({
    action: action("rewrite"),
    selection: { providerId: "ollama", modelId: "llama3" },
    systemPrompt: "You rewrite.",
    parameters: { temperatureMillis: 600, maxOutputBytes: 65_536 },
    input: "hello",
    instruction: "",
    requestId: "request-1",
  });

  assert.equal(request.requestId, "request-1");
  assert.equal(request.providerId, "ollama");
  assert.equal(request.modelId, "llama3");
  assert.equal(request.systemPrompt, "You rewrite.");
  assert.equal(request.userPrompt, "hello");
  assert.equal(request.parameters.maxOutputBytes, 65_536);
  assert.equal(request.parameters.temperatureMillis, 600);
  assert.equal(request.parameters.retryCount, 0);
  assert.ok(request.parameters.timeoutMs > 0);
});
