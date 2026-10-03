import { bindInstallPrompt } from "@/platform/browser/install-prompt";
import { applyShellUpdate, registerShellWorker } from "@/platform/browser/service-worker";
import {
  claimRiskAnnouncement,
  describePersistenceRisk,
  requestWorkspacePersistence,
} from "@/platform/browser/storage-persistence";
import { isBrowserRuntime } from "@/platform/runtime/runtime";
import { showToast } from "@/shared/ui/toast";
import { bindViewport } from "@/shell/viewport";
import { initZoom } from "@/shell/zoom";

/**
 * Asks this browser to keep the workspace and reports when the device is
 * running out of room. OPFS is the canonical store in the browser, so an
 * evicted origin is lost work rather than a cold cache.
 */
export async function announcePersistenceRisk(): Promise<void> {
  if (!isBrowserRuntime()) {
    return;
  }
  const state = await requestWorkspacePersistence();
  const warning = describePersistenceRisk(state);
  if (warning && claimRiskAnnouncement(state)) {
    showToast({
      message: warning.message,
      description: warning.description,
      durationMs: 12_000,
    });
  }
}

/**
 * Offers the newly installed build instead of swapping it in. Reloading under
 * an open editor would discard whatever has not reached the database yet, and
 * a shell from one build must never drive a database another build migrated.
 */
function offerShellUpdate(): void {
  showToast({
    message: "A new version of Skriuw is ready.",
    action: { label: "Reload", run: () => void applyShellUpdate() },
    durationMs: 60_000,
  });
}

/**
 * Binds the page-level services that live for the whole tab: zoom, the
 * viewport, and in the browser the shell cache worker and the install prompt.
 * They unbind when the page is hidden for good.
 */
export function bindPageServices(): void {
  const unbindZoom = initZoom();
  const unbindViewport = bindViewport(window, document.documentElement);
  const unbindShellWorker = isBrowserRuntime() ? registerShellWorker(offerShellUpdate) : () => {};
  const unbindInstallPrompt = isBrowserRuntime() ? bindInstallPrompt(window) : () => {};
  window.addEventListener(
    "pagehide",
    () => {
      unbindZoom();
      unbindViewport();
      unbindShellWorker();
      unbindInstallPrompt();
    },
    { once: true },
  );
}
