import { useState } from "react";
import { useAuth } from "@remcostoeten/auth-drawer";
import { isBrowserRuntime } from "@/bridge/runtime";
import { CloseIcon, CloudOffIcon } from "@/shared/icons/static";
import {
  browserStorageNoticeVisible,
  readBrowserStorageNoticeDismissed,
  rememberBrowserStorageNoticeDismissed,
} from "./browser-storage-notice-model";

const DESKTOP_DOWNLOAD_URL = "https://skriuw.com/download/";

type Props = {
  onSignIn: () => void;
};

const actionClass =
  "shrink-0 rounded-md px-2 py-1 font-medium text-foreground/86 no-underline transition-colors hover:bg-foreground/6 hover:text-foreground";

/**
 * Quiet strip under the editor telling a signed-out browser visitor that
 * their notes exist only in this browser, with the two ways to keep them:
 * the desktop app on disk, or an account in the cloud.
 */
export function BrowserStorageNotice({ onSignIn }: Props) {
  const { user, isPending } = useAuth();
  const [dismissed, setDismissed] = useState(readBrowserStorageNoticeDismissed);
  if (
    !browserStorageNoticeVisible({
      browser: isBrowserRuntime(),
      signedIn: user !== null,
      pending: isPending,
      dismissed,
    })
  ) {
    return null;
  }
  function dismiss(): void {
    rememberBrowserStorageNoticeDismissed();
    setDismissed(true);
  }
  return (
    <div
      role="note"
      aria-label="Browser storage"
      className="flex min-h-9 shrink-0 items-center gap-2 border-t border-sidebar-border bg-sidebar ps-3 pe-1 text-[12px] text-muted-foreground keyboard-open:hidden"
    >
      <CloudOffIcon size={14} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-auto truncate">
        Saved in this browser only, which can clear it. Get the desktop app to keep notes offline,
        or sign in to store them in the cloud.
      </span>
      <a
        href={DESKTOP_DOWNLOAD_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={actionClass}
      >
        Get desktop
      </a>
      <button type="button" className={actionClass} onClick={onSignIn}>
        Sign in
      </button>
      <button
        type="button"
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/6 hover:text-foreground"
        aria-label="Dismiss"
        onClick={dismiss}
      >
        <CloseIcon size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
