import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { App } from "./app";
import { bootstrapWorkspace } from "./bridge/commands";
import type { HistoryHeader } from "./contracts/workspace";
import { listenForHistoryHeaders } from "./history/live-history";
import { bindSettingsToRoot } from "./settings/apply-settings";
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
    const snapshot = await bootstrapWorkspace();
    store = createRendererStore(createInitialState(snapshot));
    for (const header of pendingHeaders) {
      store.publishHistoryHeader(header);
    }
    window.addEventListener("pagehide", unlistenHistory, { once: true });
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
