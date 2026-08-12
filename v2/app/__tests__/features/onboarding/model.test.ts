import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_WORKSPACE_SETTINGS } from "../../../src/features/settings/settings-model";
import {
  completeOnboarding,
  hasCompletedOnboarding,
  shouldShowOnboarding,
} from "../../../src/features/onboarding/model";

test("an unstamped workspace shows onboarding", () => {
  assert.equal(shouldShowOnboarding(DEFAULT_WORKSPACE_SETTINGS), true);
});

test("seeded preview content does not suppress onboarding", () => {
  assert.equal(shouldShowOnboarding({ ...DEFAULT_WORKSPACE_SETTINGS }), true);
});

test("a completed workspace never shows onboarding again", () => {
  assert.equal(
    shouldShowOnboarding(completeOnboarding(DEFAULT_WORKSPACE_SETTINGS)),
    false,
  );
});

test("completion is versioned and preserves unknown settings", () => {
  const settings = { ...DEFAULT_WORKSPACE_SETTINGS, futureSetting: "kept" };
  const completed = completeOnboarding(settings);
  assert.equal(completed.onboardingVersion, 1);
  assert.equal(completed.futureSetting, "kept");
  assert.equal(hasCompletedOnboarding(completed), true);
  assert.equal(completeOnboarding(completed), completed);
});

test("future onboarding versions remain completed", () => {
  assert.equal(
    hasCompletedOnboarding({ ...DEFAULT_WORKSPACE_SETTINGS, onboardingVersion: 2 }),
    true,
  );
});
