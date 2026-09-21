import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { App } from "./app";
import { AppWindowIcon, WarningIcon } from "@/shared/icons/static";
import { refreshSessionState } from "@/features/auth/adapter";
import { listenForSessionExpiry } from "@/features/auth/session-expiry";
import { currentSessionToken, forgetSessionToken } from "@/features/auth/session-token";
import { bindStarterReclaim } from "@/features/onboarding/reclaim";
import { seedRelationshipFixture } from "@/features/onboarding/debug-seed";
import { seedStarterWorkspace } from "@/features/onboarding/seed";
import {
  applyLaunchCapture,
  parseLaunchCapture,
  stripLaunchCapture,
} from "@/features/capture/launch-capture";
import {
  applyWorkspaceOperations,
  bootstrapWorkspace,
  closeWorkspaceWindow,
  loadPaneLayout,
  loadSidebarExpansion,
  readWorkspaceDelta,
  revealMainWindow,
  savePaneLayout,
  saveSidebarExpansion,
} from "@/bridge/commands";
import { clearBrowserData, isBrowserRuntime, releaseBrowserStorage } from "@/bridge/runtime";
import { bindInstallPrompt, installOffered, promptInstall } from "@/bridge/install-prompt";
import { applyShellUpdate, registerShellWorker } from "@/bridge/service-worker";
import {
  claimRiskAnnouncement,
  describePersistenceRisk,
  requestWorkspacePersistence,
} from "@/bridge/storage-persistence";
import type { HistoryHeader } from "@skriuw/renderer-core/contracts/workspace";
import { listenForHistoryHeaders } from "@/features/history/live-history";
import {
  listenForSyncedWorkspaceChanges,
  type WorkspaceChange,
} from "@/features/sync/live-workspace";
import { bindPropagationTriggers } from "@/features/sync/propagation-triggers";
import { createSyncReconciler } from "@/features/sync/reconcile";
import { bindWindowClosePersistence } from "@/shell/window-close";
import { flushPendingWork, registerPendingWork } from "@/shell/pending-work";
import {
  createStartupFailureFlow,
  describeStartupFailure,
  type StartupFailure,
} from "@/shell/startup-failure";
import { StartupScreen } from "@/shell/startup-screen";
import {
  browserTabLockChannel,
  claimWorkspaceTab,
  holdWorkspaceTab,
  watchWorkspaceRelease,
} from "@/shell/workspace-tab-lock";
import { bindSettingsToRoot } from "@/features/settings/apply-settings";
import { bindLockSession } from "@/features/lock/lock-session";
import { commitGate } from "@skriuw/renderer-core/store/commit-gate";
import { bindPaneLayoutPersistence } from "@skriuw/renderer-core/store/pane-layout-persistence";
import { parsePaneLayout } from "@skriuw/renderer-core/store/panes";
import { restoreSession } from "@skriuw/renderer-core/store/session-restore";
import { bindSidebarExpansionPersistence } from "@skriuw/renderer-core/store/sidebar-expansion-persistence";
import { createInitialState, createRendererStore } from "@skriuw/renderer-core/store/store";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { initZoom } from "@/shell/zoom-controller";
import { bindThemeColor } from "@/shell/theme-color";
import { bindViewport } from "@/shell/viewport";
import { showToast } from "@/shared/ui/toast";
import "@remcostoeten/notifier/styles";
import "./styles.css";

const REVEAL_FRAME_TIMEOUT_MS = 100;
const BLOCKED_RETRY_INTERVAL_MS = 5_000;

let revealed = false;

/**
 * Reports how durable this browser is willing to make the workspace. OPFS is
 * the canonical store in the browser, so an evicted origin is lost work rather
 * than a cold cache; a best-effort grant is worth saying out loud while the
 * user can still export.
 */
async function announcePersistenceRisk(): Promise<void> {
  const state = await requestWorkspacePersistence();
  const warning = describePersistenceRisk(state);
  if (warning && claimRiskAnnouncement(state)) {
    showToast({
      message: warning.message,
      description: warning.description,
      durationMs: 12_000,
      ...(state.kind === "best-effort" && installOffered()
        ? { action: { label: "Install", run: () => void promptInstall() } }
        : {}),
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
 * Reveals the main window once the first application frame has painted. The
 * window ships hidden behind a native splash so the cold-start webview never
 * shows an empty shell; a Rust-side failsafe reveals it anyway if the renderer
 * never gets here.
 */
function revealWindow(): void {
  if (isBrowserRuntime() || revealed) {
    return;
  }
  function reveal(): void {
    if (revealed) {
      return;
    }
    revealed = true;
    void revealMainWindow().catch((error) => console.error("window reveal failed", error));
  }
  // WebKitGTK does not reliably schedule animation frames for an unmapped
  // window, so the paint-aligned path is raced against a timer. Losing the
  // race costs a few milliseconds; relying on frames alone can stall until
  // the Rust failsafe fires.
  requestAnimationFrame(() => requestAnimationFrame(reveal));
  setTimeout(reveal, REVEAL_FRAME_TIMEOUT_MS);
}

/**
 * Opens the workspace and mounts the application. Resolves with a `detach`
 * that flushes and unbinds everything the session registered, so the tab can
 * give the durable database up without losing accepted writes.
 */
async function openWorkspace(root: Root): Promise<() => Promise<void>> {
  let unlistenHistory: UnlistenFn | null = null;
  let unlistenSyncWorkspace: UnlistenFn | null = null;
  let unlistenSessionExpiry: UnlistenFn | null = null;
  try {
    let store: RendererStore | null = null;
    let reconciler: ReturnType<typeof createSyncReconciler> | null = null;
    const pendingHeaders: HistoryHeader[] = [];
    let changeBeforeStore: WorkspaceChange | null = null;
    unlistenSyncWorkspace = await listenForSyncedWorkspaceChanges((change) => {
      if (!reconciler) {
        changeBeforeStore = { noteIds: [], structureChanged: true, full: true };
        return;
      }
      reconciler.report(change);
    });
    unlistenSessionExpiry = await listenForSessionExpiry(() => {
      void forgetSessionToken()
        .catch((error) => console.error("expired session credential clear failed", error))
        .finally(refreshSessionState);
    });
    if (!isBrowserRuntime()) {
      unlistenHistory = await listenForHistoryHeaders((header) => {
        if (store) {
          store.publishHistoryHeader(header);
          return;
        }
        pendingHeaders.push(header);
      });
    }
    const [snapshot, expandedFolderIds, paneLayoutJson] = await Promise.all([
      bootstrapWorkspace(),
      loadSidebarExpansion().catch((error) => {
        console.error("sidebar expansion load failed", error);
        return [];
      }),
      loadPaneLayout().catch((error) => {
        console.error("pane layout load failed", error);
        return null;
      }),
    ]);
    store = createRendererStore(createInitialState(snapshot, expandedFolderIds ?? [], {
      tags: snapshot.tags,
      people: snapshot.people,
      references: snapshot.references,
    }));
    const restoredLayout = parsePaneLayout(paneLayoutJson);
    if (restoredLayout) {
      store.update((current) => restoreSession(current, restoredLayout, snapshot.activeNoteId));
    }
    const unbindWindowClosePersistence = isBrowserRuntime()
      ? () => {}
      : await bindWindowClosePersistence(
          store,
          applyWorkspaceOperations,
          {
            onCloseRequested: (handler) => getCurrentWindow().onCloseRequested(handler),
            completeClose: closeWorkspaceWindow,
          },
          {
            onError: (error) => {
              console.error("window close persistence failed", error);
              showToast({
                message: "Skriuw stayed open because some changes are not saved yet.",
                durationMs: 8_000,
              });
            },
            onCloseError: (error) => {
              console.error("window close failed", error);
              showToast({
                message: "Skriuw could not close its window. Try again.",
                durationMs: 8_000,
              });
            },
            onContinuityError: (error) => {
              console.error("window close continuity persistence failed", error);
            },
          },
        );
    const expansionPersistence = bindSidebarExpansionPersistence(
      store,
      saveSidebarExpansion,
      { onError: (error) => console.error("sidebar expansion persistence failed", error) },
    );
    const paneLayoutPersistence = bindPaneLayoutPersistence(
      store,
      savePaneLayout,
      { onError: (error) => console.error("pane layout persistence failed", error) },
    );
    const unregisterExpansionFlush = registerPendingWork(expansionPersistence.flush, {
      bestEffort: true,
    });
    const unregisterPaneLayoutFlush = registerPendingWork(paneLayoutPersistence.flush, {
      bestEffort: true,
    });
    function disposeUiPersistence(): void {
      unregisterExpansionFlush();
      unregisterPaneLayoutFlush();
      void Promise.all([
        expansionPersistence.dispose(),
        paneLayoutPersistence.dispose(),
      ]).catch((error) => {
        console.error("ui persistence dispose failed", error);
      });
    }
    for (const header of pendingHeaders) {
      store.publishHistoryHeader(header);
    }
    reconciler = createSyncReconciler({
      store,
      gate: commitGate,
      bootstrap: bootstrapWorkspace,
      readDelta: readWorkspaceDelta,
      onError: (error) => console.error("synced workspace reconciliation failed", error),
      onRecoveryNeeded: () => showToast({
        message: "Synced changes could not refresh. Retry to update this view.",
        action: { label: "Retry refresh", run: () => reconciler?.retry() },
        durationMs: 60_000,
      }),
    });
    if (changeBeforeStore) {
      reconciler.report(changeBeforeStore);
      changeBeforeStore = null;
    }
    const unbindPropagationTriggers = bindPropagationTriggers();
    function teardownSession(): void {
      reconciler?.dispose();
      unlistenHistory?.();
      unlistenSyncWorkspace?.();
      unlistenSessionExpiry?.();
      unbindPropagationTriggers();
      unbindWindowClosePersistence();
      unbindLockSession();
      unbindThemeColor();
      disposeUiPersistence();
    }
    window.addEventListener("pagehide", teardownSession, { once: true });
    bindStarterReclaim(store);
    await seedStarterWorkspace(
      store,
      async () => (await currentSessionToken()) !== undefined,
    ).catch((error) => {
      console.error("starter workspace seeding failed", error);
    });
    await seedRelationshipFixture(store).catch((error) => {
      console.error("relationship fixture seeding failed", error);
    });
    bindSettingsToRoot(store, document.documentElement);
    const unbindLockSession = bindLockSession(store);
    const unbindThemeColor = bindThemeColor(store, document.documentElement);
    void announcePersistenceRisk();
    const launchCapture = parseLaunchCapture(window.location.search);
    if (launchCapture) {
      window.history.replaceState(null, "", stripLaunchCapture(window.location.href));
      applyLaunchCapture(store, launchCapture).catch((error) => {
        console.error("launch capture failed", error);
        showToast({
          message: "Skriuw could not capture what was shared. Try pasting it into a note.",
          durationMs: 8_000,
        });
      });
    }
    root.render(
      <StrictMode>
        <App store={store} />
      </StrictMode>,
    );
    return async () => {
      window.removeEventListener("pagehide", teardownSession);
      await flushPendingWork();
      teardownSession();
    };
  } catch (error) {
    unlistenHistory?.();
    unlistenSyncWorkspace?.();
    unlistenSessionExpiry?.();
    throw error;
  }
}

/**
 * Drives startup, and in the browser arbitrates the single-writer database
 * between tabs: a blocked tab waits for the holder instead of dead-ending on an
 * error, and the holder yields on request rather than forcing a manual close.
 */
function main(): void {
  const unbindZoom = initZoom();
  const unbindViewport = bindViewport(window, document.documentElement);
  const unbindShellWorker = registerShellWorker(offerShellUpdate);
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
  const container = document.getElementById("root");
  if (!container) {
    throw new Error("missing root container");
  }
  const root = createRoot(container);
  const lock = isBrowserRuntime() ? browserTabLockChannel() : null;
  let unbindHolder: (() => void) | null = null;
  let unbindWaiting: (() => void) | null = null;
  let opening = false;

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
    const retryWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void attemptOpen();
      }
    };
    document.addEventListener("visibilitychange", retryWhenVisible);
    const timer = setInterval(retryWhenVisible, BLOCKED_RETRY_INTERVAL_MS);
    unbindWaiting = () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", retryWhenVisible);
      clearInterval(timer);
    };
  }

  async function takeOver(): Promise<void> {
    if (!lock) {
      return;
    }
    renderBlocked(true);
    await claimWorkspaceTab(lock);
    await attemptOpen();
  }

  function renderBlocked(claiming: boolean): void {
    root.render(
      <StartupScreen
        icon={<AppWindowIcon size={24} />}
        title="Skriuw is open in another tab"
        detail="Your workspace is a single database on this device, so only one tab can hold it at a time."
        hint={
          claiming
            ? "Asking the other tab to hand it over…"
            : "This tab opens on its own as soon as the other one lets go."
        }
        actions={[
          {
            label: "Use this tab instead",
            variant: "primary",
            disabled: claiming,
            onSelect: () => void takeOver(),
          },
          { label: "Retry", disabled: claiming, onSelect: () => void attemptOpen() },
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
    unbindHolder?.();
    unbindHolder = null;
    try {
      const detach = await openWorkspace(root);
      stopWaiting();
      if (lock) {
        unbindHolder = holdWorkspaceTab(lock, async () => {
          await detach();
          renderHandedOver();
          await releaseBrowserStorage();
        });
        window.addEventListener("pagehide", () => lock.post({ kind: "released" }), { once: true });
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

main();
