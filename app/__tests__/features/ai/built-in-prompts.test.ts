import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  BUILT_IN_PROMPT_LIBRARY_VERSION,
  BUILT_IN_PROMPTS,
  builtInPrompt,
} from "../../../src/features/ai/built-in-prompts";
import {
  MAX_PROMPT_NAME_BYTES,
  MAX_PROMPT_OUTPUT_BYTES,
  MAX_PROMPT_SYSTEM_BYTES,
  MAX_PROMPT_TEMPERATURE_MILLIS,
} from "../../../src/features/ai/prompt-library";

const GENERATED = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../contracts/generated/built-in-prompts.json",
);

test("the shipped library is the generated contract", () => {
  const generated = JSON.parse(readFileSync(GENERATED, "utf8")) as {
    version: number;
    prompts: unknown[];
  };
  assert.equal(BUILT_IN_PROMPT_LIBRARY_VERSION, generated.version);
  assert.deepEqual(BUILT_IN_PROMPTS, generated.prompts);
});

test("every built-in is addressable and inside the stored prompt bounds", () => {
  const ids = new Set<string>();
  for (const prompt of BUILT_IN_PROMPTS) {
    assert.equal(ids.has(prompt.id), false, `duplicate built-in ${prompt.id}`);
    ids.add(prompt.id);
    assert.deepEqual(builtInPrompt(prompt.id), prompt);
    assert.ok(prompt.name.trim().length > 0);
    assert.ok(new TextEncoder().encode(prompt.name).length <= MAX_PROMPT_NAME_BYTES);
    assert.ok(prompt.systemPrompt.trim().length > 0);
    assert.ok(new TextEncoder().encode(prompt.systemPrompt).length <= MAX_PROMPT_SYSTEM_BYTES);
    assert.ok(prompt.parameters.maxOutputBytes > 0);
    assert.ok(prompt.parameters.maxOutputBytes <= MAX_PROMPT_OUTPUT_BYTES);
    if (prompt.parameters.temperatureMillis !== null) {
      assert.ok(prompt.parameters.temperatureMillis >= 0);
      assert.ok(prompt.parameters.temperatureMillis <= MAX_PROMPT_TEMPERATURE_MILLIS);
    }
  }
  assert.equal(builtInPrompt("not-a-prompt"), null);
});

test("the classic writing actions all ship", () => {
  const ids = new Set(BUILT_IN_PROMPTS.map((prompt) => prompt.id));
  for (const expected of [
    "rewrite",
    "improve",
    "fix-grammar",
    "shorten",
    "lengthen",
    "change-tone",
    "simplify",
    "translate",
    "summarize",
    "title",
    "outline",
    "continue",
    "custom",
  ]) {
    assert.ok(ids.has(expected), `missing built-in ${expected}`);
  }
});
