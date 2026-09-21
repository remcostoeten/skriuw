import { useState, useSyncExternalStore } from "react";
import { installOffered, promptInstall, subscribeInstallOffer } from "@/bridge/install-prompt";
import { CloseIcon, DownloadIcon } from "@/shared/icons/static";
import {
  installBannerVisible,
  readInstallBannerDismissed,
  rememberInstallBannerDismissed,
} from "./install-banner-model";

type Props = {
  compact: boolean;
};

/**
 * One-line strip above the tab bar offering to put Skriuw on the home screen.
 * It appears only while the browser holds an install offer, and closing it is
 * remembered for the profile; the Install entries in the account menu and Data
 * settings stay available after that.
 */
export function InstallBanner({ compact }: Props) {
  const offered = useSyncExternalStore(subscribeInstallOffer, installOffered, () => false);
  const [dismissed, setDismissed] = useState(readInstallBannerDismissed);
  if (!installBannerVisible({ compact, offered, dismissed })) {
    return null;
  }
  function dismiss(): void {
    rememberInstallBannerDismissed();
    setDismissed(true);
  }
  return (
    <div role="region" aria-label="Install Skriuw" className="shell-install-banner">
      <DownloadIcon size={16} className="shrink-0" aria-hidden="true" />
      <span className="shell-install-banner-text">Add Skriuw to your home screen</span>
      <button
        type="button"
        className="shell-install-banner-install"
        onClick={() => void promptInstall()}
      >
        Install
      </button>
      <button
        type="button"
        className="shell-install-banner-close"
        aria-label="Not now"
        onClick={dismiss}
      >
        <CloseIcon size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
