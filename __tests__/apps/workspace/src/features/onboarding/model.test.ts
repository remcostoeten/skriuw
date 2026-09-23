import assert from "node:assert/strict";
import { test } from "vitest";
import { DEFAULT_WORKSPACE_SETTINGS } from "@/features/settings/settings-model";
import {
  completeOnboarding,
  hasCompletedOnboarding,
  shouldShowOnboarding,
} from "@/features/onboarding/model";
import { completeSeed } from "@/features/onboarding/starter-model";

test("an unstamped workspace shows onboarding", () => {
  assert.equal(shouldShowOnboarding(DEFAULT_WORKSPACE_SETTINGS), true);
});

test("seeded preview content does not suppress onboarding", () => {
  const seeded = completeSeed(DEFAULT_WORKSPACE_SETTINGS, ["starter-a", "starter-b"], 1_000);
  assert.equal(shouldShowOnboarding(seeded), true);
});

test("a completed workspace never shows onboarding again", () => {
  assert.equal(shouldShowOnboarding(completeOnboarding(DEFAULT_WORKSPACE_SETTINGS)), false);
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
