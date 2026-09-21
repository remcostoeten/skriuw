import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WORKSPACE_PROTOCOL_VERSION } from "@skriuw/renderer-core/contracts/workspace";
import { bindSettingsToRoot } from "@/features/settings/apply-settings";
import { DEFAULT_WORKSPACE_SETTINGS } from "@/features/settings/settings-model";
import { createInitialState, createRendererStore } from "@skriuw/renderer-core/store/store";
import { InMemoryCustomThemeRegistry } from "@skriuw/theme";
import { installEditorSession } from "./active-session";
import { createEditorSession } from "./editor-session";
import { StandaloneEditor } from "./standalone-editor";
import { windowTransport } from "./transport";
import "./standalone.css";

function errorDetail(reason: unknown): string {
  return reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
}

function start(): void {
  const root = document.getElementById("editor-root");
  if (!root) throw new Error("The editor page has no #editor-root element.");
  const store = createRendererStore(
    createInitialState({
      protocolVersion: WORKSPACE_PROTOCOL_VERSION,
      activeNoteId: null,
      nodes: [],
      documents: [],
      historyHeaders: [],
      settings: DEFAULT_WORKSPACE_SETTINGS,
      tags: [],
      people: [],
      references: [],
    }),
  );
  const transport = windowTransport();
  const themeRegistry = new InMemoryCustomThemeRegistry();
  const session = createEditorSession({ store, send: transport.send, themeRegistry });
  installEditorSession(session);
  window.addEventListener("error", (event) => {
    session.fail("runtime-error", errorDetail(event.error ?? event.message));
  });
  window.addEventListener("unhandledrejection", (event) => {
    session.fail("runtime-error", errorDetail(event.reason));
  });
  bindSettingsToRoot(store, document.documentElement, themeRegistry);
  createRoot(root).render(
    <StrictMode>
      <StandaloneEditor store={store} />
    </StrictMode>,
  );
  transport.listen(session.receive);
  session.ready();
}

start();
