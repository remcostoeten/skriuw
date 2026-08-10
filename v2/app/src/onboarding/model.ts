import type { WorkspaceSettings } from "../contracts/workspace";

export const ONBOARDING_VERSION = 1;

export function hasCompletedOnboarding(settings: WorkspaceSettings): boolean {
  const version = settings["onboardingVersion"];
  return (
    typeof version === "number" &&
    Number.isInteger(version) &&
    version >= ONBOARDING_VERSION
  );
}

/**
 * Keyed on the stamp alone rather than on an empty workspace, because a fresh
 * visitor is seeded with preview notes before the first render.
 */
export function shouldShowOnboarding(settings: WorkspaceSettings): boolean {
  return !hasCompletedOnboarding(settings);
}

export function completeOnboarding(
  settings: WorkspaceSettings,
): WorkspaceSettings {
  if (hasCompletedOnboarding(settings)) return settings;
  return { ...settings, onboardingVersion: ONBOARDING_VERSION };
}
