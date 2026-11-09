import { currentSnapshot, takeEarlyBootstrap } from "@/app/early-bootstrap";
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
 * and builds the renderer store from them. On desktop the reads were started
 * by `index.html` before the bundle loaded and are reused when still current;
 * callers must be listening for workspace changes before calling. Continuity
 * is best-effort: a failed sidebar or pane-layout read falls back to defaults,
 * while a failed bootstrap rejects so startup can surface it.
 */
export async function loadWorkspaceStore(): Promise<RendererStore> {
  const early = takeEarlyBootstrap();
  const [snapshot, expandedFolderIds, paneLayoutJson] = await Promise.all([
    early ? currentSnapshot(early.snapshot) : bootstrapWorkspace(),
    (early?.sidebarExpansion ?? loadSidebarExpansion()).catch((error) => {
      console.error("sidebar expansion load failed", error);
      return [];
    }),
    (early?.paneLayout ?? loadPaneLayout()).catch((error) => {
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
