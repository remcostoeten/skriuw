/**
 * What a sync cycle changed in canonical storage. `full` covers hydration and
 * bulk applies where listing note ids would be pointless; `structureChanged`
 * means something other than a document body moved (tree, tags, properties…).
 */
export type WorkspaceChange = {
  noteIds: readonly string[];
  structureChanged: boolean;
  full: boolean;
};

/** Folds two change reports into one, so coalesced reconciles never under-read. */
export function mergeWorkspaceChanges(
  left: WorkspaceChange | null,
  right: WorkspaceChange,
): WorkspaceChange {
  if (!left) return right;
  return {
    noteIds: [...new Set([...left.noteIds, ...right.noteIds])],
    structureChanged: left.structureChanged || right.structureChanged,
    full: left.full || right.full,
  };
}
