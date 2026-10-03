import type { Root } from "react-dom/client";
import { openWorkspace } from "@/app/open-workspace";
import {
  createStartupFailureFlow,
  describeStartupFailure,
  type StartupFailure,
} from "@/app/startup-failure";
import { StartupScreen } from "@/app/startup-screen";
import { revealWindow } from "@/app/window-reveal";
import {
  browserTabLockChannel,
  claimWorkspaceTab,
  holdWorkspaceTab,
  watchWorkspaceRelease,
  type WorkspaceTabHold,
} from "@/app/workspace-tab-lock";
import {
  abandonBrowserStorage,
  clearBrowserData,
  releaseBrowserStorage,
} from "@/platform/browser/storage";
import { isBrowserRuntime } from "@/platform/runtime/runtime";
import { AppWindowIcon, WarningIcon } from "@/shared/icons/static";

const BLOCKED_RETRY_INTERVAL_MS = 5_000;

/**
 * Opens the workspace into `root` and renders startup failures in its place.
 * In the browser it also arbitrates the single-writer database between tabs:
 * a blocked tab waits for the holder instead of dead-ending on an error, and
 * the holder yields on request rather than forcing a manual close.
 */
export function startWorkspace(root: Root): void {
  const lock = isBrowserRuntime() ? browserTabLockChannel() : null;
  let hold: WorkspaceTabHold | null = null;
  let unbindWaiting: (() => void) | null = null;
  let opening = false;
  let abandoned = false;
  let handoverRefused = false;

  // A page frozen into the back/forward cache runs nothing, so it can neither
  // answer a claim nor close its worker: it would hold the single-writer
  // database until the browser discarded it. Dropping the worker on the way out
  // keeps the next tab usable, and the restored page reloads to write again.
  window.addEventListener("pagehide", () => {
    // Not conditioned on holding: a tab still opening the workspace, or still
    // closing it gracefully, has a worker on the exclusive handles all the same.
    if (!isBrowserRuntime() || !abandonBrowserStorage()) {
      return;
    }
    abandoned = true;
    lock?.post({ kind: "released" });
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && abandoned) {
      window.location.reload();
    }
  });

  // Mobile browsers freeze a backgrounded page without warning. Once another
  // tab is known to be waiting, this tab hands the workspace over as it leaves
  // view rather than risking a freeze that would strand the waiting tab.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && hold?.contested()) {
      void hold.yieldNow().catch((error) => console.error("workspace handover failed", error));
    }
  });

  function stopWaiting(): void {
    unbindWaiting?.();
    unbindWaiting = null;
  }

  // A holder that crashes never announces its release, so the blocked tab also
  // retries whenever it regains focus and on a slow timer while it is visible.
  function startWaiting(): void {
    if (!lock || unbindWaiting) {
      return;
    }
    const unsubscribe = watchWorkspaceRelease(lock, () => void attemptOpen());
    // Every retry claims again: a holder that was asleep when the first claim
    // went out only hears the one that reaches it after it wakes.
    function retryWhenVisible() {
      if (document.visibilityState === "visible") {
        void claimAndOpen(false);
      }
    }
    document.addEventListener("visibilitychange", retryWhenVisible);
    const timer = setInterval(retryWhenVisible, BLOCKED_RETRY_INTERVAL_MS);
    unbindWaiting = () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", retryWhenVisible);
      clearInterval(timer);
    };
  }

  async function claimAndOpen(announce: boolean): Promise<void> {
    if (!lock || opening) {
      return;
    }
    if (announce) {
      renderBlocked(true);
    }
    await claimWorkspaceTab(lock);
    await attemptOpen();
    if (!hold && !opening) {
      // The holder never answered, so it is frozen or gone rather than busy.
      // Saying so beats repeating that this tab will open on its own.
      handoverRefused = true;
      renderBlocked(false);
    }
  }

  function blockedHint(claiming: boolean): string {
    if (claiming) {
      return "Asking the other tab to hand it over…";
    }
    if (handoverRefused) {
      return "The other tab is not answering. Close it, or keep using Skriuw there; this one opens as soon as it lets go.";
    }
    return "This tab opens on its own as soon as the other one lets go.";
  }

  function renderBlocked(claiming: boolean): void {
    root.render(
      <StartupScreen
        icon={<AppWindowIcon size={24} />}
        title="Skriuw is open in another tab"
        detail="Your workspace is a single database on this device, so only one tab can hold it at a time."
        hint={blockedHint(claiming)}
        actions={[
          {
            label: "Use this tab instead",
            variant: "primary",
            disabled: claiming,
            onSelect: () => void claimAndOpen(true),
          },
          { label: "Retry", disabled: claiming, onSelect: () => void claimAndOpen(false) },
        ]}
      />,
    );
  }

  function renderHandedOver(): void {
    root.render(
      <StartupScreen
        icon={<AppWindowIcon size={24} />}
        title="Skriuw moved to another tab"
        detail="This tab handed the workspace over and stopped saving. Everything you wrote here was stored first."
        actions={[
          {
            label: "Use this tab instead",
            variant: "primary",
            onSelect: () => void reclaim(),
          },
        ]}
      />,
    );
  }

  async function reclaim(): Promise<void> {
    if (lock) {
      await claimWorkspaceTab(lock);
    }
    // The release latched in the bridge, so this tab reopens by reloading.
    window.location.reload();
  }

  const failureFlow = createStartupFailureFlow({
    browserRuntime: isBrowserRuntime(),
    resetWorkspace: clearBrowserData,
    retry: () => void attemptOpen(),
    render: (view) => {
      root.render(
        <StartupScreen
          icon={<WarningIcon size={24} />}
          title={view.title}
          detail={view.detail}
          hint={view.hint}
          actions={view.actions}
        />,
      );
    },
    reportError: (error) => console.error("workspace reset failed", error),
  });

  function renderFailure(failure: StartupFailure): void {
    if (lock && failure.code === "already_open") {
      startWaiting();
      renderBlocked(false);
      return;
    }
    failureFlow.show(failure);
  }

  async function attemptOpen(): Promise<void> {
    if (opening) {
      return;
    }
    opening = true;
    hold?.dispose();
    hold = null;
    try {
      const detach = await openWorkspace(root);
      stopWaiting();
      handoverRefused = false;
      if (lock) {
        hold = holdWorkspaceTab(lock, async () => {
          await detach();
          hold?.dispose();
          hold = null;
          renderHandedOver();
          await releaseBrowserStorage();
        });
      }
    } catch (error) {
      console.error("workspace failed to open", error);
      renderFailure(describeStartupFailure(error));
    } finally {
      opening = false;
    }
    revealWindow();
  }

  void attemptOpen();
}
