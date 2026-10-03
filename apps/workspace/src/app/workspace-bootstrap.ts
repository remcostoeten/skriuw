import {
  bootstrapWorkspace,
  loadPaneLayout,
  loadSidebarExpansion,
} from "@/platform/runtime/commands";
import { parsePaneLayout } from "@skriuw/renderer-core/store/panes";
import { restoreSession } from "@skriuw/renderer-core/store/session-restore";
import { createInitialState, createRendererStore } from "@skriuw/renderer-core/store/store";
import type { RendererStore } from "@skriuw/renderer-core/store/types";

/**
 * Reads the workspace snapshot and the persisted UI continuity in one round
 * and builds the renderer store from them. Continuity is best-effort: a
 * failed sidebar or pane-layout read falls back to defaults, while a failed
 * bootstrap rejects so startup can surface it.
 */
export async function loadWorkspaceStore(): Promise<RendererStore> {
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
  const store = createRendererStore(
    createInitialState(snapshot, expandedFolderIds ?? [], {
      tags: snapshot.tags,
      people: snapshot.people,
      references: snapshot.references,
    }),
  );
  const restoredLayout = parsePaneLayout(paneLayoutJson);
  if (restoredLayout) {
    store.update((current) => restoreSession(current, restoredLayout, snapshot.activeNoteId));
  }
  return store;
}
