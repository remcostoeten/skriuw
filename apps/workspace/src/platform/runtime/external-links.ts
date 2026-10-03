import { openInLinkWindow, openInSystemBrowser } from "@/platform/desktop/links";
import { hasTauriRuntime } from "./runtime";
import { noop } from "@skriuw/shared/helpers/noop";

const OPENABLE_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * True when the URL is an absolute http(s) address, the only shape safe to hand
 * to the operating system browser. Rejects javascript:, file:, data: and
 * anything unparseable.
 */
export function isOpenableExternalUrl(url: string): boolean {
  try {
    return OPENABLE_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    noop();
    return false;
  }
}

/**
 * Opens the URL in the user's default browser, falling back to a new tab when
 * running outside the desktop shell. Unopenable URLs are ignored.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (!isOpenableExternalUrl(url)) return;
  if (!hasTauriRuntime()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  await openInSystemBrowser(url);
}

/**
 * Opens the URL in Skriuw's own browser window, which the desktop shell
 * shares across every link so opening another one navigates the same window.
 * Outside the desktop shell there is no second window to own, so it falls back
 * to a new tab. Unopenable URLs are ignored.
 */
export async function openLinkInApp(url: string): Promise<void> {
  if (!isOpenableExternalUrl(url)) return;
  if (!hasTauriRuntime()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  await openInLinkWindow(url);
}
