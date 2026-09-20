import type { BridgePort } from "../../../shared/renderer-core/src/bridge/port";
import { bindSidebarExpansionPersistence } from "../../../shared/renderer-core/src/store/sidebar-expansion-persistence";
import {
  createInitialState,
  createRendererStore,
} from "../../../shared/renderer-core/src/store/store";
import type { WorkspaceSession } from "../bridge/commit";

export type ShellSession = WorkspaceSession & {
  /** Flushes the expansion write and drops the store's subscribers. */
  close: () => Promise<void>;
};

/**
 * Opens the workspace once, at startup. Everything after this is a
 * synchronous store read, so no navigation waits on the bridge
 * (`docs/specs/mobile-app.md`, R-P1).
 */
export async function openWorkspaceSession(
  bridge: BridgePort,
  reportFailure: (error: unknown) => void,
): Promise<ShellSession> {
  const snapshot = await bridge.bootstrapWorkspace();
  const expansion = await bridge.loadSidebarExpansion();
  const store = createRendererStore(
    createInitialState(snapshot, expansion ?? undefined, {
      tags: snapshot.tags,
      people: snapshot.people,
      references: snapshot.references,
    }),
  );
  const expansionBinding = bindSidebarExpansionPersistence(store, (folderIds) =>
    bridge.saveSidebarExpansion(folderIds),
  );

  return {
    store,
    bridge,
    reportFailure,
    async close() {
      await expansionBinding.dispose();
      store.destroy();
    },
  };
}
