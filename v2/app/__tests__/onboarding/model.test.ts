import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_WORKSPACE_SETTINGS } from "../../src/settings/settings-model";
import {
  completeOnboarding,
  hasCompletedOnboarding,
  shouldShowOnboarding,
} from "../../src/onboarding/model";

test("an empty new workspace shows onboarding", () => {
  assert.equal(shouldShowOnboarding(DEFAULT_WORKSPACE_SETTINGS, 0), true);
});

test("existing workspace content suppresses onboarding after an upgrade", () => {
  assert.equal(shouldShowOnboarding(DEFAULT_WORKSPACE_SETTINGS, 1), false);
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
