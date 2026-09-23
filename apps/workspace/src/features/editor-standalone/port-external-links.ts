import { activeEditorSession } from "./active-session";
import { noop } from "@skriuw/shared/helpers/noop";

/**
 * Stands in for `@/bridge/external-links` in the standalone editor bundle: a
 * webview must not open windows itself, so every link becomes an `open-link`
 * message and the host decides where it goes.
 */

const OPENABLE_PROTOCOLS = new Set(["http:", "https:"]);

export function isOpenableExternalUrl(url: string): boolean {
  try {
    return OPENABLE_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    noop();
    return false;
  }
}

export function hasTauriRuntime(): boolean {
  return false;
}

export function openExternalUrl(url: string): Promise<void> {
  if (isOpenableExternalUrl(url)) activeEditorSession().openLink(url);
  return Promise.resolve();
}

export function openLinkInApp(url: string): Promise<void> {
  return openExternalUrl(url);
}
