import { openUrl } from "@tauri-apps/plugin-opener";
import { noop } from "../shared/lib/noop";

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

function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
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
  await openUrl(url);
}
