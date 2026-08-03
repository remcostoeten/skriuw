import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { App } from "./app";
import {
  applyWorkspaceOperations,
  bootstrapWorkspace,
  closeWorkspaceWindow,
  loadPaneLayout,
  loadSidebarExpansion,
  savePaneLayout,
  saveSidebarExpansion,
} from "./bridge/commands";
import { isBrowserRuntime } from "./bridge/runtime";
import type { HistoryHeader } from "./contracts/workspace";
import { listenForHistoryHeaders } from "./history/live-history";
import { bindWindowClosePersistence } from "./lifecycle/window-close";
import { registerPendingWork } from "./lifecycle/pending-work";
import { bindSettingsToRoot } from "./settings/apply-settings";
import { opensNotesInTabs } from "./settings/settings-model";
import { bindPaneLayoutPersistence } from "./store/pane-layout-persistence";
import { parsePaneLayout, restorePanes } from "./store/panes";
import { bindSidebarExpansionPersistence } from "./store/sidebar-expansion-persistence";
import { createInitialState, createRendererStore } from "./store/store";
import type { RendererStore } from "./store/types";
import { initZoom } from "./zoom/zoom-controller";
import { showToast } from "./shared/ui/toast";
import "./styles.css";

async function start(): Promise<void> {
  const unbindZoom = initZoom();
  window.addEventListener("pagehide", unbindZoom, { once: true });
  const container = document.getElementById("root");
  if (!container) {
    throw new Error("missing root container");
  }
  const root = createRoot(container);
  let unlistenHistory: UnlistenFn | null = null;
  try {
    let store: RendererStore | null = null;
    const pendingHeaders: HistoryHeader[] = [];
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
    const restoredPanes = parsePaneLayout(paneLayoutJson);
    if (restoredPanes) {
      store.update((current) => ({
        ...current,
        panes: restorePanes(
          restoredPanes,
          current.activeNoteId,
          current.sourceNodes,
          opensNotesInTabs(current.settings),
        ),
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
    window.addEventListener("pagehide", unlistenHistory ?? (() => {}), { once: true });
    window.addEventListener("pagehide", unbindWindowClosePersistence, { once: true });
    window.addEventListener("pagehide", disposeUiPersistence, { once: true });
    bindSettingsToRoot(store, document.documentElement);
    root.render(
      <StrictMode>
        <App store={store} />
      </StrictMode>,
    );
  } catch (error) {
    unlistenHistory?.();
    root.render(
      <div className="p-6 text-[hsl(var(--mood-rough))]" role="alert">
        Workspace failed to open: {String(error)}
      </div>,
    );
  }
}

void start();
