import { commitOperations } from "../actions/workspace";
import type { WorkspaceOperation } from "../contracts/workspace";
import type { RendererStore } from "../store/types";
import { forgetSeededNotes, reclaimableNoteIds, seededNoteIds } from "./model";

let boundStore: RendererStore | null = null;

/**
 * Sign-in success is observed by the auth adapter, which has no workspace
 * handle, so the renderer hands its store over at startup.
 */
export function bindStarterReclaim(store: RendererStore): void {
  boundStore = store;
}

export async function reclaimBoundStarterPreview(): Promise<void> {
  if (!boundStore) return;
  await reclaimStarterPreview(boundStore);
}

/**
 * Signing in adopts the preview only where the visitor made it theirs. Notes
 * still untouched are dropped instead of being pushed into an account that
 * already holds a real workspace; edited ones sync like anything else.
 */
export async function reclaimStarterPreview(store: RendererStore): Promise<void> {
  const state = store.getState();
  if (seededNoteIds(state.settings).length === 0) {
    return;
  }
  const present = [...state.sourceNodes.values()]
    .filter((node) => node.kind === "note" && node.deletedAt === null)
    .map((node) => ({ id: node.id, updatedAt: node.updatedAt }));
  const discardable = reclaimableNoteIds(state.settings, present);
  const at = Date.now();
  const operations: WorkspaceOperation[] = discardable.map((rootId) => ({
    type: "trash_subtree",
    rootId,
    at,
  }));
  operations.push({
    type: "update_settings",
    settings: forgetSeededNotes(store.getState().settings),
  });
  await commitOperations(store, operations);
}
