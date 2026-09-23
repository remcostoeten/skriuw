import { noop } from "@skriuw/shared/helpers/noop";

const DISMISSED_KEY = "skriuw.install-banner.dismissed.v1";

type BannerInputs = {
  compact: boolean;
  offered: boolean;
  dismissed: boolean;
};

/**
 * The install strip earns its row only on a phone that can install right now
 * and has not waved it away: the offer itself already implies a browser
 * runtime that is not yet installed, so nothing else needs checking.
 */
export function installBannerVisible({ compact, offered, dismissed }: BannerInputs): boolean {
  return compact && offered && !dismissed;
}

/** Whether the user has closed the strip on this profile before. */
export function readInstallBannerDismissed(storage?: Storage): boolean {
  try {
    return (storage ?? globalThis.localStorage).getItem(DISMISSED_KEY) === "1";
  } catch {
    noop();
    return false;
  }
}

/**
 * Remembers the dismissal. A blocked localStorage only means the strip comes
 * back next launch, so the failure is not surfaced.
 */
export function rememberInstallBannerDismissed(storage?: Storage): void {
  try {
    (storage ?? globalThis.localStorage).setItem(DISMISSED_KEY, "1");
  } catch {
    noop();
  }
}
