import assert from "node:assert/strict";
import test from "node:test";
import {
  stagePlaygroundPrefill,
  takePlaygroundPrefill,
} from "../../../src/features/ai/playground-prefill";

test("a staged run is handed to the playground exactly once", () => {
  assert.equal(takePlaygroundPrefill(), null);

  stagePlaygroundPrefill({
    selection: { providerId: "groq", modelId: "openai/gpt-oss-120b" },
    systemPrompt: "be terse",
    userPrompt: "name a colour",
  });

  const taken = takePlaygroundPrefill();
  assert.equal(taken?.userPrompt, "name a colour");
  assert.equal(taken?.selection.providerId, "groq");
  assert.equal(takePlaygroundPrefill(), null);
});
