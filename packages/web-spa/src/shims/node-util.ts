/**
 * Minimal `node:util` shim for the browser bundle. Only `promisify` is used in
 * shared code (wrapping node:crypto.scrypt in cloud share-token hashing, which
 * is gated off on desktop). The wrapper is import-safe; calling it ultimately
 * invokes the underlying (stubbed) callback API.
 */
type Callback = (...args: unknown[]) => void;

export function promisify<T extends (...args: never[]) => void>(fn: T) {
	return function (...args: unknown[]): Promise<unknown> {
		return new Promise((resolve, reject) => {
			const callback: Callback = (err, result) => {
				if (err) reject(err);
				else resolve(result);
			};
			(fn as unknown as (...a: unknown[]) => void)(...args, callback);
		});
	};
}

export default { promisify };
