import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { updateSettings } from "@/store/settings";
import type { WorkspaceSettings } from "@skriuw/renderer-core/contracts/workspace";
import { isDiffLayout, type DiffLayout } from "./split-model";

/**
 * How the history view lays out a revision diff. Unified unless the workspace
 * explicitly chose side-by-side, so older workspaces keep the single column.
 */
export function historyDiffLayout(settings: WorkspaceSettings): DiffLayout {
  const value = settings["historyDiffLayout"];
  return isDiffLayout(value) ? value : "unified";
}

export function changeHistoryDiffLayout(
  settings: WorkspaceSettings,
  layout: DiffLayout,
): WorkspaceSettings {
  return { ...settings, historyDiffLayout: layout };
}

export function setHistoryDiffLayout(store: RendererStore, layout: DiffLayout): void {
  updateSettings(store, changeHistoryDiffLayout(store.getState().settings, layout));
}
