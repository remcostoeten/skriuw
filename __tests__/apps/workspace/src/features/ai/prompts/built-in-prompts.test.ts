import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { repositoryPath } from "../../../../../../support/paths";
import {
  BUILT_IN_PROMPT_LIBRARY_VERSION,
  BUILT_IN_PROMPTS,
  builtInPrompt,
} from "@/features/ai/prompts/built-in-prompts";
import {
  MAX_PROMPT_NAME_BYTES,
  MAX_PROMPT_OUTPUT_BYTES,
  MAX_PROMPT_SYSTEM_BYTES,
  MAX_PROMPT_TEMPERATURE_MILLIS,
} from "@/features/ai/prompts/prompt-library";
import {
  clampMaxOutputBytes,
  clampTemperatureMillis,
  promptByteError,
} from "@/features/ai/prompts/playground-model";

const GENERATED = repositoryPath("contracts/generated/built-in-prompts.json");

test("the shipped library is the generated contract", () => {
  const generated = JSON.parse(readFileSync(GENERATED, "utf8")) as {
    version: number;
    prompts: unknown[];
  };
  assert.equal(BUILT_IN_PROMPT_LIBRARY_VERSION, generated.version);
  assert.deepEqual(BUILT_IN_PROMPTS, generated.prompts);
});

test("every built-in is addressable and survives the stored and playground bounds", () => {
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
    assert.equal(promptByteError(prompt.systemPrompt, "selected text"), null);
    assert.equal(
      clampMaxOutputBytes(`${prompt.parameters.maxOutputBytes}`),
      prompt.parameters.maxOutputBytes,
      `${prompt.id} loses its output bound in the playground`,
    );
    if (prompt.parameters.temperatureMillis !== null) {
      assert.ok(prompt.parameters.temperatureMillis >= 0);
      assert.ok(prompt.parameters.temperatureMillis <= MAX_PROMPT_TEMPERATURE_MILLIS);
      assert.equal(
        clampTemperatureMillis(`${prompt.parameters.temperatureMillis / 1000}`),
        prompt.parameters.temperatureMillis,
        `${prompt.id} loses its temperature in the playground`,
      );
    }
  }
  assert.equal(builtInPrompt("not-a-prompt"), null);
});
