/**
 * Shared write-serialization for the two `WorkspaceBackend`s that perform a
 * read-modify-write in JS and so can't lean on the database for atomicity:
 *
 * - **Guest** (`local-backend` → IndexedDB): the whole workspace is a single
 *   blob, so every mutation reads, mutates, and rewrites the entire payload.
 *   All of its writes share one key.
 * - **Desktop** (`tauri-backend` → Rust/SQLite): each update reads a row over
 *   IPC, merges the patch in JS, then writes it back. Writes are keyed per
 *   record id, so edits to unrelated records still run concurrently.
 *
 * The **server** backend deliberately uses neither: it issues partial-column
 * `UPDATE`s that touch only the fields that changed, so the database serializes
 * concurrent writers and a drag-to-move never clobbers an in-flight autosave.
 * Prefer that model wherever a column store is available; this queue is the
 * fallback for the two environments that don't have one.
 *
 * Tasks chained on the same key run strictly one after another. A task's
 * rejection is isolated: it surfaces to that caller but never blocks or breaks
 * the chain for later tasks on the same key.
 */
export type WriteQueue = {
	runExclusive<T>(key: string, task: () => Promise<T>): Promise<T>;
};

export function createWriteQueue(): WriteQueue {
	const chains = new Map<string, Promise<unknown>>();

	function runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
		const previous = chains.get(key) ?? Promise.resolve();
		// Run `task` whether the previous task settled or rejected — a failed
		// write must not wedge the queue for everything that follows it.
		const run = previous.then(task, task);
		chains.set(
			key,
			run.then(
				() => undefined,
				() => undefined,
			),
		);
		return run;
	}

	return { runExclusive };
}
