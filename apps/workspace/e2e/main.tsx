import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../src/app";
import { installEditorExtensions } from "../src/app/editor-extensions";
import { bindInstallPrompt } from "../src/platform/browser/install-prompt";
import { bindSettingsToRoot } from "../src/features/settings/apply-settings";
import { createInitialState, createRendererStore } from "@skriuw/renderer-core/store/store";
import { configureBridge, invoke } from "./bridge-mock";
import { createWorkflowSnapshot } from "./fixture";
import { createWorkflowController } from "./harness";
import { createTaskShowcaseSnapshot } from "./tasks-fixture";
import type { WorkflowController } from "./harness";
import "../src/styles.css";

declare global {
  var __SKRIUW_WORKFLOW_E2E__: WorkflowController;
}

Object.defineProperty(window, "__TAURI_INTERNALS__", {
  value: { invoke, transformCallback: () => 0, unregisterCallback: () => undefined },
});

const parameters = new URLSearchParams(window.location.search);
const fixture =
  parameters.get("fixture") === "tasks" ? createTaskShowcaseSnapshot() : createWorkflowSnapshot();
const theme = parameters.get("theme");
const snapshot = theme ? { ...fixture, settings: { ...fixture.settings, theme } } : fixture;
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
installEditorExtensions();
// The real entry binds this only in the browser runtime; here the mobile e2e
// fires a synthetic beforeinstallprompt to drive the install strip.
bindInstallPrompt(window);
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
