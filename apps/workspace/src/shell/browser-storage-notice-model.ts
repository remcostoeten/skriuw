import { noop } from "@skriuw/shared/helpers/noop";

const DISMISSED_KEY = "skriuw.browser-storage-notice.dismissed.v1";

type NoticeInputs = {
  browser: boolean;
  signedIn: boolean;
  pending: boolean;
  dismissed: boolean;
};

/**
 * The notice speaks only for a browser workspace with no account behind it:
 * there the browser's own storage is the only copy. The desktop app writes to
 * disk, and a signed-in workspace already has a cloud copy.
 */
export function browserStorageNoticeVisible({
  browser,
  signedIn,
  pending,
  dismissed,
}: NoticeInputs): boolean {
  return browser && !signedIn && !pending && !dismissed;
}

/** Whether the user has closed the notice on this profile before. */
export function readBrowserStorageNoticeDismissed(storage?: Storage): boolean {
  try {
    return (storage ?? globalThis.localStorage).getItem(DISMISSED_KEY) === "1";
  } catch {
    noop();
    return false;
  }
}

/**
 * Remembers the dismissal. A blocked localStorage only means the notice comes
 * back next launch, so the failure is not surfaced.
 */
export function rememberBrowserStorageNoticeDismissed(storage?: Storage): void {
  try {
    (storage ?? globalThis.localStorage).setItem(DISMISSED_KEY, "1");
  } catch {
    noop();
  }
}
