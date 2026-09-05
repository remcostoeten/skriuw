import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AppWindow, TriangleAlert } from "lucide-react";
import { App } from "./app";
import { refreshSessionState } from "@/features/auth/adapter";
import { listenForSessionExpiry } from "@/features/auth/session-expiry";
import { currentSessionToken, forgetSessionToken } from "@/features/auth/session-token";
import { bindStarterReclaim } from "@/features/onboarding/reclaim";
import { seedRelationshipFixture } from "@/features/onboarding/debug-seed";
import { seedStarterWorkspace } from "@/features/onboarding/seed";
import {
  applyWorkspaceOperations,
  bootstrapWorkspace,
  closeWorkspaceWindow,
  loadPaneLayout,
  loadSidebarExpansion,
  readWorkspaceDelta,
  savePaneLayout,
  saveSidebarExpansion,
} from "@/bridge/commands";
import { isBrowserRuntime, releaseBrowserStorage } from "@/bridge/runtime";
import type { HistoryHeader } from "@/contracts/workspace";
import { listenForHistoryHeaders } from "@/features/history/live-history";
import {
  listenForSyncedWorkspaceChanges,
  type WorkspaceChange,
} from "@/features/sync/live-workspace";
import { bindPropagationTriggers } from "@/features/sync/propagation-triggers";
import { createSyncReconciler } from "@/features/sync/reconcile";
import { bindWindowClosePersistence } from "@/shell/window-close";
import { flushPendingWork, registerPendingWork } from "@/shell/pending-work";
import { StartupScreen } from "@/shell/startup-screen";
import {
  browserTabLockChannel,
  claimWorkspaceTab,
  holdWorkspaceTab,
  watchWorkspaceRelease,
} from "@/shell/workspace-tab-lock";
import { bindSettingsToRoot } from "@/features/settings/apply-settings";
import { commitGate } from "@/store/commit-gate";
import { bindPaneLayoutPersistence } from "@/store/pane-layout-persistence";
import { parsePaneLayout } from "@/store/panes";
import { restoreSession } from "@/store/session-restore";
import { bindSidebarExpansionPersistence } from "@/store/sidebar-expansion-persistence";
import { createInitialState, createRendererStore } from "@/store/store";
import type { RendererStore } from "@/store/types";
import { initZoom } from "@/shell/zoom-controller";
import { showToast } from "@/shared/ui/toast";
import "@remcostoeten/notifier/styles";
import "./styles.css";

const REVEAL_FRAME_TIMEOUT_MS = 100;
const BLOCKED_RETRY_INTERVAL_MS = 5_000;

type StartupFailure = {
  code: string | null;
  message: string;
  recovery: string | null;
};

/**
 * Startup rejections arrive either as `Error`s or as the plain
 * `BrowserStorageFailure` records the storage worker rejects with, so the
 * fallback screen has to read both instead of stringifying an object.
 */
function describeStartupFailure(error: unknown): StartupFailure {
  if (error instanceof Error) {
    return { code: null, message: error.message, recovery: null };
  }
  if (typeof error === "object" && error !== null) {
    const failure = error as { code?: unknown; message?: unknown; recovery?: unknown };
    const message = typeof failure.message === "string" ? failure.message : null;
    const code = typeof failure.code === "string" ? failure.code : null;
    if (message !== null || code !== null) {
      return {
        code,
        message: message ?? `Browser storage failed (${code}).`,
        recovery: typeof failure.recovery === "string" ? failure.recovery : null,
      };
    }
  }
  return { code: null, message: String(error), recovery: null };
}

let revealed = false;

/**
 * Reveals the main window once the first application frame has painted. The
 * window ships hidden so the cold-start webview never shows an empty shell;
 * a Rust-side failsafe reveals it anyway if the renderer never gets here.
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
    const appWindow = getCurrentWindow();
    void appWindow
      .show()
      .then(() => appWindow.setFocus())
      .catch((error) => console.error("window reveal failed", error));
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
    });
    if (changeBeforeStore) {
      reconciler.report(changeBeforeStore);
      changeBeforeStore = null;
    }
    const unbindPropagationTriggers = bindPropagationTriggers();
    function teardownSession(): void {
      unlistenHistory?.();
      unlistenSyncWorkspace?.();
      unlistenSessionExpiry?.();
      unbindPropagationTriggers();
      unbindWindowClosePersistence();
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
  window.addEventListener("pagehide", unbindZoom, { once: true });
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
        icon={<AppWindow />}
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
        icon={<AppWindow />}
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

  function renderFailure(failure: StartupFailure): void {
    if (lock && failure.code === "already_open") {
      startWaiting();
      renderBlocked(false);
      return;
    }
    root.render(
      <StartupScreen
        icon={<TriangleAlert />}
        title="Skriuw could not open your workspace"
        detail={failure.message}
        hint={failure.recovery}
        actions={[{ label: "Retry", variant: "primary", onSelect: () => void attemptOpen() }]}
      />,
    );
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
