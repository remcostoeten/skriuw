import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { App } from "./app";
import { currentSessionToken } from "@/features/auth/session-token";
import { bindStarterReclaim } from "@/features/onboarding/reclaim";
import { seedRelationshipFixture } from "@/features/onboarding/debug-seed";
import { seedStarterWorkspace } from "@/features/onboarding/seed";
import {
  applyWorkspaceOperations,
  bootstrapWorkspace,
  closeWorkspaceWindow,
  loadPaneLayout,
  loadSidebarExpansion,
  savePaneLayout,
  saveSidebarExpansion,
} from "@/bridge/commands";
import { isBrowserRuntime } from "@/bridge/runtime";
import type { HistoryHeader } from "@/contracts/workspace";
import { listenForHistoryHeaders } from "@/features/history/live-history";
import { listenForSyncedWorkspaceChanges } from "@/features/sync/live-workspace";
import { bindWindowClosePersistence } from "@/shell/window-close";
import { flushPendingWork, registerPendingWork } from "@/shell/pending-work";
import { bindSettingsToRoot } from "@/features/settings/apply-settings";
import { opensNotesInTabs } from "@/features/settings/settings-model";
import { bindPaneLayoutPersistence } from "@/store/pane-layout-persistence";
import { parsePaneLayout, restorePanes } from "@/store/panes";
import { bindSidebarExpansionPersistence } from "@/store/sidebar-expansion-persistence";
import { createInitialState, createRendererStore } from "@/store/store";
import type { RendererStore } from "@/store/types";
import { initZoom } from "@/shell/zoom-controller";
import { showToast } from "@/shared/ui/toast";
import "./styles.css";

const REVEAL_FRAME_TIMEOUT_MS = 100;

type StartupFailure = {
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
    return { message: error.message, recovery: null };
  }
  if (typeof error === "object" && error !== null) {
    const failure = error as { code?: unknown; message?: unknown; recovery?: unknown };
    const message = typeof failure.message === "string" ? failure.message : null;
    const code = typeof failure.code === "string" ? failure.code : null;
    if (message !== null || code !== null) {
      return {
        message: message ?? `Browser storage failed (${code}).`,
        recovery: typeof failure.recovery === "string" ? failure.recovery : null,
      };
    }
  }
  return { message: String(error), recovery: null };
}

/**
 * Reveals the main window once the first application frame has painted. The
 * window ships hidden so the cold-start webview never shows an empty shell;
 * a Rust-side failsafe reveals it anyway if the renderer never gets here.
 */
function revealWindow(): void {
  if (isBrowserRuntime()) {
    return;
  }
  let revealed = false;
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

async function start(): Promise<void> {
  const unbindZoom = initZoom();
  window.addEventListener("pagehide", unbindZoom, { once: true });
  const container = document.getElementById("root");
  if (!container) {
    throw new Error("missing root container");
  }
  const root = createRoot(container);
  let unlistenHistory: UnlistenFn | null = null;
  let unlistenSyncWorkspace: UnlistenFn | null = null;
  try {
    let store: RendererStore | null = null;
    const pendingHeaders: HistoryHeader[] = [];
    let syncReconcilePending = false;
    let syncReconciliation = Promise.resolve();
    unlistenSyncWorkspace = await listenForSyncedWorkspaceChanges(() => {
      if (!store) {
        syncReconcilePending = true;
        return;
      }
      syncReconciliation = syncReconciliation
        .then(async () => {
          await flushPendingWork();
          store?.replaceFromSnapshot(await bootstrapWorkspace());
        })
        .catch((error) => console.error("synced workspace reconciliation failed", error));
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
      store.update((current) => ({
        ...current,
        panes: restorePanes(
          restoredLayout.panes,
          current.activeNoteId,
          current.sourceNodes,
          opensNotesInTabs(current.settings),
        ),
        splitOrientation: restoredLayout.orientation,
        splitRatio: restoredLayout.ratio,
      }));
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
    const unregisterExpansionFlush = registerPendingWork(expansionPersistence.flush);
    const unregisterPaneLayoutFlush = registerPendingWork(paneLayoutPersistence.flush);
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
    if (syncReconcilePending) {
      await flushPendingWork();
      store.replaceFromSnapshot(await bootstrapWorkspace());
    }
    window.addEventListener("pagehide", unlistenHistory ?? (() => {}), { once: true });
    window.addEventListener("pagehide", unlistenSyncWorkspace ?? (() => {}), { once: true });
    window.addEventListener("pagehide", unbindWindowClosePersistence, { once: true });
    window.addEventListener("pagehide", disposeUiPersistence, { once: true });
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
  } catch (error) {
    unlistenHistory?.();
    unlistenSyncWorkspace?.();
    console.error("workspace failed to open", error);
    const failure = describeStartupFailure(error);
    root.render(
      <div className="p-6 text-[hsl(var(--mood-rough))]" role="alert">
        <p>Workspace failed to open: {failure.message}</p>
        {failure.recovery === null ? null : <p className="mt-2">{failure.recovery}</p>}
      </div>,
    );
  }
  revealWindow();
}

void start();
