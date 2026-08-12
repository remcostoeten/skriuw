// ---------------------------------------------------------------------------
// write-queue.ts (mobile copy)
//
// Per-record write serialization. Autosave can fire faster than the network
// responds; without serialization two PATCHes race and the older one can win.
// This queues writes per key (note id) so they apply in order, and coalesces
// so only the latest pending write for a key runs after the in-flight one.
//
// On web this is apps/web/src/core/workspace-backend/write-queue.ts — pure TS,
// extracted to @skriuw/domain in Phase 0. This copy keeps the mobile app
// buildable before the extraction.
// ---------------------------------------------------------------------------

type Task<T> = () => Promise<T>;

type Pending = {
	run: Task<unknown>;
	resolve: (v: unknown) => void;
	reject: (e: unknown) => void;
};

export class WriteQueue {
	private inFlight = new Map<string, boolean>();
	private pending = new Map<string, Pending>();

	/** Enqueue a write for `key`. If a write is already in flight for that key,
	 *  this replaces any earlier still-pending write (latest-wins coalescing). */
	enqueue<T>(key: string, run: Task<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			this.pending.set(key, {
				run: run as Task<unknown>,
				resolve: resolve as (v: unknown) => void,
				reject,
			});
			if (!this.inFlight.get(key)) {
				void this.drain(key);
			}
		});
	}

	private async drain(key: string): Promise<void> {
		this.inFlight.set(key, true);
		try {
			while (this.pending.has(key)) {
				const next = this.pending.get(key)!;
				this.pending.delete(key);
				try {
					const result = await next.run();
					next.resolve(result);
				} catch (err) {
					next.reject(err);
				}
			}
		} finally {
			this.inFlight.set(key, false);
		}
	}
}
