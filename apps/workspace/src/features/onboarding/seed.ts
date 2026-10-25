import { commitOperations } from "@/store/commit";
import type { WorkspaceOperation } from "@skriuw/renderer-core/contracts/workspace";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import {
  completeSeed,
  isUnseededFreshWorkspace,
  markSeedSpent,
  shouldSeedStarter,
} from "./starter/model";
import { withBooksBoard } from "./starter/books";
import { loadStarterTree } from "./starter/tree";
import { planStarterWorkspace } from "./starter/plan";

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
  const plan = planStarterWorkspace(tree, at, () => crypto.randomUUID());
  const settings = completeSeed(
    store.getState().settings,
    plan.notes.map((note) => note.id),
    at,
  );
  const operations: WorkspaceOperation[] = [
    ...plan.operations,
    ...plan.contentOperations,
    ...plan.propertyOperations,
    {
      type: "update_settings",
      settings:
        plan.booksFolderId === null ? settings : withBooksBoard(settings, plan.booksFolderId, at),
    },
  ];
  await commitOperations(store, operations);
  if (plan.welcomeNoteId !== null && store.getState().activeNoteId === null) {
    store.setActiveNote(plan.welcomeNoteId);
  }
}
