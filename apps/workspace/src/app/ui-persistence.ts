import { bindWindowClosePersistence } from "@/app/window-close";
import { onWindowCloseRequested } from "@/platform/desktop/window";
import {
  applyWorkspaceOperations,
  closeWorkspaceWindow,
  savePaneLayout,
  saveSidebarExpansion,
} from "@/platform/runtime/commands";
import { isBrowserRuntime } from "@/platform/runtime/runtime";
import { showToast } from "@/shared/ui/toast";
import { registerPendingWork } from "@/store/pending-work";
import { bindPaneLayoutPersistence } from "@skriuw/renderer-core/store/pane-layout-persistence";
import { bindSidebarExpansionPersistence } from "@skriuw/renderer-core/store/sidebar-expansion-persistence";
import type { RendererStore } from "@skriuw/renderer-core/store/types";

/**
 * In the desktop shell, holds the window open until pending changes are
 * saved. The browser has no close request to hold, so it binds nothing there.
 */
export async function bindDesktopWindowClose(store: RendererStore): Promise<() => void> {
  if (isBrowserRuntime()) {
    return () => {};
  }
  return bindWindowClosePersistence(
    store,
    applyWorkspaceOperations,
    {
      onCloseRequested: onWindowCloseRequested,
      completeClose: closeWorkspaceWindow,
    },
    {
      onError: (error) => {
        console.error("window close persistence failed", error);
        showToast({
          message: "Skriuw stayed open because some changes are not saved yet.",
          durationMs: 8_000,
        });
      },
      onCloseError: (error) => {
        console.error("window close failed", error);
        showToast({
          message: "Skriuw could not close its window. Try again.",
          durationMs: 8_000,
        });
      },
      onContinuityError: (error) => {
        console.error("window close continuity persistence failed", error);
      },
    },
  );
}

/**
 * Persists sidebar expansion and the pane layout as they change, and flushes
 * them as best-effort pending work. Returns the disposer.
 */
export function bindUiPersistence(store: RendererStore): () => void {
  const expansionPersistence = bindSidebarExpansionPersistence(store, saveSidebarExpansion, {
    onError: (error) => console.error("sidebar expansion persistence failed", error),
  });
  const paneLayoutPersistence = bindPaneLayoutPersistence(store, savePaneLayout, {
    onError: (error) => console.error("pane layout persistence failed", error),
  });
  const unregisterExpansionFlush = registerPendingWork(expansionPersistence.flush, {
    bestEffort: true,
  });
  const unregisterPaneLayoutFlush = registerPendingWork(paneLayoutPersistence.flush, {
    bestEffort: true,
  });
  return () => {
    unregisterExpansionFlush();
    unregisterPaneLayoutFlush();
    void Promise.all([expansionPersistence.dispose(), paneLayoutPersistence.dispose()]).catch(
      (error) => {
        console.error("ui persistence dispose failed", error);
      },
    );
  };
}
