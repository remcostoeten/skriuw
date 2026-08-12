const STORAGE_KEY = "skriuw.debug.onboarding";
const QUERY_KEY = "onboarding";
const FORCE_VALUE = "force";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Development-only escape hatch for replaying the first-run screen, which is
 * otherwise reachable only with an empty workspace and an unstamped
 * `onboardingVersion`. Release builds tree-shake this to `false`.
 *
 * Set it with `?onboarding=force` in the browser build, or
 * `localStorage.setItem("skriuw.debug.onboarding", "force")` from the
 * inspector in the desktop build, then reload.
 */
export function readOnboardingOverride(): boolean {
  if (!import.meta.env.DEV) return false;
  if (new URLSearchParams(window.location.search).get(QUERY_KEY) === FORCE_VALUE) {
    storage()?.setItem(STORAGE_KEY, FORCE_VALUE);
    return true;
  }
  return storage()?.getItem(STORAGE_KEY) === FORCE_VALUE;
}

export function clearOnboardingOverride(): void {
  if (!import.meta.env.DEV) return;
  storage()?.removeItem(STORAGE_KEY);
}
