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
import type { HistoryHeader } from "./contracts/workspace";
import { listenForHistoryHeaders } from "./history/live-history";
import { bindWindowClosePersistence } from "./lifecycle/window-close";
import { bindSettingsToRoot } from "./settings/apply-settings";
import { opensNotesInTabs } from "./settings/settings-model";
import { bindPaneLayoutPersistence } from "./store/pane-layout-persistence";
import { parsePaneLayout, syncPanes } from "./store/panes";
import { bindSidebarExpansionPersistence } from "./store/sidebar-expansion-persistence";
import { createInitialState, createRendererStore } from "./store/store";
import type { RendererStore } from "./store/types";
import { initZoom } from "./zoom/zoom-controller";
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
    unlistenHistory = await listenForHistoryHeaders((header) => {
      if (store) {
        store.publishHistoryHeader(header);
        return;
      }
      pendingHeaders.push(header);
    });
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
        panes: syncPanes(
          restoredPanes,
          current.activeNoteId,
          current.sourceNodes,
          opensNotesInTabs(current.settings),
        ),
      }));
    }
    const appWindow = getCurrentWindow();
    const unbindWindowClosePersistence = await bindWindowClosePersistence(
      store,
      applyWorkspaceOperations,
      {
        onCloseRequested: (handler) => appWindow.onCloseRequested(handler),
        completeClose: closeWorkspaceWindow,
      },
      { onError: (error) => console.error("active note close persistence failed", error) },
    );
    const unbindExpansionPersistence = bindSidebarExpansionPersistence(
      store,
      saveSidebarExpansion,
      { onError: (error) => console.error("sidebar expansion persistence failed", error) },
    );
    const unbindPaneLayoutPersistence = bindPaneLayoutPersistence(
      store,
      savePaneLayout,
      { onError: (error) => console.error("pane layout persistence failed", error) },
    );
    for (const header of pendingHeaders) {
      store.publishHistoryHeader(header);
    }
    window.addEventListener("pagehide", unlistenHistory, { once: true });
    window.addEventListener("pagehide", unbindWindowClosePersistence, { once: true });
    window.addEventListener("pagehide", unbindExpansionPersistence, { once: true });
    window.addEventListener("pagehide", unbindPaneLayoutPersistence, { once: true });
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
