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

/** Existing workspaces should never be interrupted by newly introduced onboarding. */
export function shouldShowOnboarding(
  settings: WorkspaceSettings,
  workspaceNodeCount: number,
): boolean {
  return workspaceNodeCount === 0 && !hasCompletedOnboarding(settings);
}

export function completeOnboarding(
  settings: WorkspaceSettings,
): WorkspaceSettings {
  if (hasCompletedOnboarding(settings)) return settings;
  return { ...settings, onboardingVersion: ONBOARDING_VERSION };
}
