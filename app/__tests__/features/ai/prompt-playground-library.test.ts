import assert from "node:assert/strict";
import test from "node:test";
import { BUILT_IN_PROMPTS } from "../../../src/features/ai/built-in-prompts";
import {
  FAKE_MODEL,
  MAX_OUTPUT_BYTES,
  MAX_PLAYGROUND_PROMPT_BYTES,
  buildPlaygroundRequest,
  clampMaxOutputBytes,
  clampTemperatureMillis,
  promptByteError,
} from "../../../src/features/ai/playground-model";
import { promptLibraryEntries } from "../../../src/features/ai/prompt-library";

/**
 * The playground's picker fills its fields from a library entry, so every
 * shipped prompt has to survive that trip and stay inside the seam's bounds
 * with the always-available fake provider selected.
 */
test("every built-in produces a runnable fake-provider request through the playground", () => {
  const entries = promptLibraryEntries(new Map());
  assert.equal(entries.length, BUILT_IN_PROMPTS.length);

  for (const entry of entries) {
    const temperature =
      entry.parameters.temperatureMillis === null
        ? ""
        : `${entry.parameters.temperatureMillis / 1000}`;
    const userPrompt = "The text the writer selected.";
    assert.equal(
      promptByteError(entry.systemPrompt, userPrompt),
      null,
      `${entry.name} exceeds ${MAX_PLAYGROUND_PROMPT_BYTES} prompt bytes`,
    );

    const request = buildPlaygroundRequest({
      selection: FAKE_MODEL,
      systemPrompt: entry.systemPrompt,
      userPrompt,
      temperatureMillis: clampTemperatureMillis(temperature),
      maxOutputBytes: clampMaxOutputBytes(`${entry.parameters.maxOutputBytes}`),
    });

    assert.equal(request.providerId, FAKE_MODEL.providerId);
    assert.equal(request.modelId, FAKE_MODEL.modelId);
    assert.equal(request.systemPrompt, entry.systemPrompt);
    assert.equal(
      request.parameters.maxOutputBytes,
      entry.parameters.maxOutputBytes,
      `${entry.name} lost its output bound`,
    );
    assert.ok(request.parameters.maxOutputBytes <= MAX_OUTPUT_BYTES);
    assert.equal(
      request.parameters.temperatureMillis,
      entry.parameters.temperatureMillis,
      `${entry.name} lost its temperature default`,
    );
  }
});
