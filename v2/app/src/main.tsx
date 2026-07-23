import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { App } from "./app";
import {
  applyWorkspaceOperations,
  bootstrapWorkspace,
  closeWorkspaceWindow,
  loadSidebarExpansion,
  saveSidebarExpansion,
} from "./bridge/commands";
import type { HistoryHeader } from "./contracts/workspace";
import { listenForHistoryHeaders } from "./history/live-history";
import { bindWindowClosePersistence } from "./lifecycle/window-close";
import { bindSettingsToRoot } from "./settings/apply-settings";
import { bindSidebarExpansionPersistence } from "./store/sidebar-expansion-persistence";
import { createInitialState, createRendererStore } from "./store/store";
import type { RendererStore } from "./store/types";
import "./styles.css";

async function start(): Promise<void> {
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
    const [snapshot, expandedFolderIds] = await Promise.all([
      bootstrapWorkspace(),
      loadSidebarExpansion().catch((error) => {
        console.error("sidebar expansion load failed", error);
        return [];
      }),
    ]);
    store = createRendererStore(createInitialState(snapshot, expandedFolderIds ?? []));
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
    for (const header of pendingHeaders) {
      store.publishHistoryHeader(header);
    }
    window.addEventListener("pagehide", unlistenHistory, { once: true });
    window.addEventListener("pagehide", unbindWindowClosePersistence, { once: true });
    window.addEventListener("pagehide", unbindExpansionPersistence, { once: true });
    bindSettingsToRoot(store, document.documentElement);
    root.render(
      <StrictMode>
        <App store={store} />
      </StrictMode>,
    );
  } catch (error) {
    unlistenHistory?.();
    root.render(
      <div className="boot-failure" role="alert">
        Workspace failed to open: {String(error)}
      </div>,
    );
  }
}

void start();
