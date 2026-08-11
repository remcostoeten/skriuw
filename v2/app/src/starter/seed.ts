import { commitOperations } from "@/actions/workspace";
import type { WorkspaceOperation } from "@/contracts/workspace";
import { planMarkdownImport } from "@/export/markdown-transfer-model";
import type { RendererStore } from "@/store/types";
import {
  completeSeed,
  isUnseededFreshWorkspace,
  markSeedSpent,
  shouldSeedStarter,
} from "./model";
import { loadStarterTree } from "./starter-notes";

/**
 * Fills a brand-new workspace with the preview notes. Runs before the first
 * render so a fresh visitor never sees an empty shell, and stamps
 * `starterSeedVersion` either way so a workspace is only ever seeded once —
 * deleting the preview has to be permanent.
 */
export async function seedStarterWorkspace(
  store: RendererStore,
  isAuthenticated: () => Promise<boolean>,
): Promise<void> {
  const state = store.getState();
  // Cheap and synchronous, so a workspace that already has content never pays
  // for the session lookup on the way to its first paint.
  if (!isUnseededFreshWorkspace(state.settings, state.sourceNodes.size)) {
    return;
  }
  const authenticated = await isAuthenticated();
  if (!shouldSeedStarter(state.settings, state.sourceNodes.size, authenticated)) {
    await commitOperations(store, [
      { type: "update_settings", settings: markSeedSpent(state.settings) },
    ]);
    return;
  }
  const tree = await loadStarterTree();
  const at = Date.now();
  const plan = planMarkdownImport(tree, at, () => crypto.randomUUID());
  const operations: WorkspaceOperation[] = [
    ...plan.operations,
    ...plan.contentOperations,
    {
      type: "update_settings",
      settings: completeSeed(
        store.getState().settings,
        plan.notes.map((note) => note.id),
        at,
      ),
    },
  ];
  await commitOperations(store, operations);
}
