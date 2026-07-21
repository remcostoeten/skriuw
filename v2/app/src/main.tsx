import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { bootstrapWorkspace } from "./bridge/commands";
import { createInitialState, createRendererStore } from "./store/store";
import "./styles.css";

async function start(): Promise<void> {
  const container = document.getElementById("root");
  if (!container) {
    throw new Error("missing root container");
  }
  const root = createRoot(container);
  try {
    const snapshot = await bootstrapWorkspace();
    const store = createRendererStore(createInitialState(snapshot));
    root.render(
      <StrictMode>
        <App store={store} />
      </StrictMode>,
    );
  } catch (error) {
    root.render(
      <div className="boot-failure" role="alert">
        Workspace failed to open: {String(error)}
      </div>,
    );
  }
}

void start();
