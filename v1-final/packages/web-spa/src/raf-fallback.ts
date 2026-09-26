/**
 * `requestAnimationFrame` starvation fallback for the desktop (WebKitGTK)
 * webview and backgrounded browser tabs.
 *
 * Why: when the document is idle or hidden, the compositor stops scheduling
 * paint frames, so a lone `requestAnimationFrame` callback can be deferred
 * indefinitely while `setTimeout` keeps running. Mantine's `<Transition>`
 * (used by every BlockNote formatting-toolbar dropdown, menu, and popover —
 * block-type/Paragraph, alignment, color, and link/anchor) advances out of its
 * initial `exited` state on a single rAF tick. When that tick never fires the
 * dropdown stays unmounted, so the menus look dead even though the click was
 * registered and the editor command itself (bold via Ctrl+B etc.) still works.
 *
 * This keeps the native rAF as the primary path so normal foreground frames are
 * untouched, and races it against a short timer so a starved callback still
 * fires. Whichever wins first settles the call; the loser is cancelled.
 */
const nativeRequestAnimationFrame =
	typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
		? window.requestAnimationFrame.bind(window)
		: null;

const nativeCancelAnimationFrame =
	typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function"
		? window.cancelAnimationFrame.bind(window)
		: null;

const FALLBACK_DELAY_MS = 50;

if (nativeRequestAnimationFrame) {
	const cancellers = new Map<number, () => void>();
	let nextHandle = 1;

	window.requestAnimationFrame = function requestAnimationFrameWithFallback(
		callback: FrameRequestCallback,
	): number {
		const handle = nextHandle++;
		let settled = false;
		let rafId: number | null = null;
		let timeoutId: ReturnType<typeof setTimeout>;

		function settle() {
			settled = true;
			cancellers.delete(handle);
			if (rafId !== null) nativeCancelAnimationFrame?.(rafId);
			clearTimeout(timeoutId);
		}

		function run(timestamp: number) {
			if (settled) return;
			settle();
			callback(timestamp);
		}

		rafId = nativeRequestAnimationFrame((timestamp) => run(timestamp));
		timeoutId = setTimeout(() => run(performance.now()), FALLBACK_DELAY_MS);

		cancellers.set(handle, () => {
			if (!settled) settle();
		});

		return handle;
	};

	window.cancelAnimationFrame = function cancelAnimationFrameWithFallback(handle: number) {
		const cancel = cancellers.get(handle);
		if (cancel) {
			cancel();
			return;
		}
		nativeCancelAnimationFrame?.(handle);
	};
}
