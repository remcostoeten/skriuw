import assert from "node:assert/strict";
import { test } from "vitest";
import { readOnboardingSkip } from "@/features/onboarding/debug-override";

test("onboarding=skip suppresses first-run onboarding", () => {
  assert.equal(readOnboardingSkip("?onboarding=skip"), true);
  assert.equal(readOnboardingSkip("?source=preview&onboarding=skip"), true);
});

test("other onboarding query values do not suppress onboarding", () => {
  assert.equal(readOnboardingSkip(""), false);
  assert.equal(readOnboardingSkip("?onboarding=force"), false);
  assert.equal(readOnboardingSkip("?onboarding=true"), false);
});
