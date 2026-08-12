import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../src/app";
import { bindSettingsToRoot } from "../src/features/settings/apply-settings";
import { createInitialState, createRendererStore } from "../src/store/store";
import { configureBridge } from "./bridge-mock";
import { createWorkflowSnapshot } from "./fixture";
import { createWorkflowController } from "./harness";
import type { WorkflowController } from "./harness";
import "../src/styles.css";

declare global {
  interface Window {
    __SKRIUW_WORKFLOW_E2E__: WorkflowController;
  }
}

const snapshot = createWorkflowSnapshot();
configureBridge(snapshot);
if (window.location.hash === "") {
  window.location.hash = "#/notes";
}
const store = createRendererStore(
  createInitialState(snapshot, ["folder-a", "folder-b"], {
    tags: snapshot.tags,
    people: snapshot.people,
    references: snapshot.references,
  }),
);
bindSettingsToRoot(store, document.documentElement);
const container = document.getElementById("root");
if (!container) {
  throw new Error("missing root container");
}
createRoot(container).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
);
window.__SKRIUW_WORKFLOW_E2E__ = createWorkflowController(store);
