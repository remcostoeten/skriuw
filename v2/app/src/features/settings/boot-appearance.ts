import type { RootSettingsAttributes } from "./apply-settings";

/**
 * Storage key holding the appearance attributes the inline bootstrap script in
 * `index.html` reads before the application bundle runs. Keeping the last
 * applied theme here removes the default-palette flash on cold start, because
 * the persisted settings document is only available after `bootstrapWorkspace`
 * resolves. Changing this key requires changing `index.html` in lockstep.
 */
export const BOOT_APPEARANCE_KEY = "skriuw.boot-appearance";

type BootAppearanceStorage = {
  setItem: (key: string, value: string) => void;
};

/**
 * Mirrors the applied appearance attributes into the pre-bundle storage slot.
 * Failures are non-fatal: the next cold start simply falls back to the default
 * palette, which is the behaviour without this mirror at all.
 */
export function writeBootAppearance(
  storage: BootAppearanceStorage,
  attributes: RootSettingsAttributes,
): void {
  try {
    storage.setItem(BOOT_APPEARANCE_KEY, JSON.stringify(attributes));
  } catch (error) {
    console.error("boot appearance persistence failed", error);
  }
}
