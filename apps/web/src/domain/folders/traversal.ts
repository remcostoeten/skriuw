/**
 * Guarded folder-tree traversal shared by the sidebar's move / delete /
 * descendant paths. Every walk carries a visited set, so a corrupt `parentId`
 * cycle — from a failed move, a bad import, or hand-edited data — terminates
 * instead of looping forever (an unguarded recursion would overflow the stack
 * and hang the render). Callers pass a `childrenOf` accessor, so the same walk
 * serves both the indexed sidebar (a `parentId → children` map) and one-off
 * flat folder arrays.
 *
 * The related descendant *count* lives in `note-indexes.ts`: it's likewise
 * visited-guarded but memoizes counts for every folder in a single O(n) pass,
 * which per-subtree walks here can't express.
 */
export type FolderTreeNode = { id: string; parentId: string | null };

/** Builds the `parentId → children` index a walk needs from a flat folder list. */
export function indexFoldersByParentId<T extends FolderTreeNode>(
	folders: readonly T[],
): Map<string | null, T[]> {
	const byParentId = new Map<string | null, T[]>();
	for (const folder of folders) {
		const siblings = byParentId.get(folder.parentId) ?? [];
		siblings.push(folder);
		byParentId.set(folder.parentId, siblings);
	}
	return byParentId;
}

/**
 * The ids of every folder in the subtree rooted at `rootId`, inclusive of the
 * root. Cycle-safe: each id is added at most once, so a looping `parentId`
 * chain still terminates.
 */
export function collectFolderSubtreeIds<T extends FolderTreeNode>(
	rootId: string,
	childrenOf: (parentId: string) => readonly T[],
): Set<string> {
	const subtree = new Set<string>();
	const stack = [rootId];

	while (stack.length > 0) {
		const current = stack.pop();
		if (current === undefined || subtree.has(current)) continue;
		subtree.add(current);
		for (const child of childrenOf(current)) {
			if (!subtree.has(child.id)) stack.push(child.id);
		}
	}

	return subtree;
}
