export type FpsSample = {
	fps: number;
	longFrames: number;
	worstFrameMs: number;
};

export type FpsDropEvent = {
	at: number;
	fps: number;
	worstFrameMs: number;
};

export type FpsMeter = {
	subscribe: (
		onSample: (sample: FpsSample) => void,
		onDrop: (drop: FpsDropEvent) => void,
	) => void;
	stop: () => void;
};

const SAMPLE_WINDOW_MS = 500;
const LONG_FRAME_MS = 50;
const DROP_FPS_THRESHOLD = 48;

/**
 * Measures real frame pacing with a requestAnimationFrame loop: emits a
 * rolling FPS sample every half second and a drop event whenever the window
 * dips below ~48fps or contains a long (>50ms) frame.
 */
export function createFpsMeter(): FpsMeter {
	let rafId = 0;
	let running = true;
	let lastFrameAt = 0;
	let windowStart = 0;
	let frames = 0;
	let longFrames = 0;
	let worstFrameMs = 0;
	let sampleListener: ((sample: FpsSample) => void) | null = null;
	let dropListener: ((drop: FpsDropEvent) => void) | null = null;

	function tick(now: number) {
		if (!running) return;
		if (lastFrameAt > 0) {
			const delta = now - lastFrameAt;
			frames += 1;
			if (delta > LONG_FRAME_MS) longFrames += 1;
			if (delta > worstFrameMs) worstFrameMs = delta;

			if (now - windowStart >= SAMPLE_WINDOW_MS) {
				const fps = Math.round((frames * 1000) / (now - windowStart));
				sampleListener?.({ fps, longFrames, worstFrameMs });
				if (fps < DROP_FPS_THRESHOLD || longFrames > 0) {
					dropListener?.({ at: now, fps, worstFrameMs });
				}
				windowStart = now;
				frames = 0;
				longFrames = 0;
				worstFrameMs = 0;
			}
		} else {
			windowStart = now;
		}
		lastFrameAt = now;
		rafId = requestAnimationFrame(tick);
	}

	rafId = requestAnimationFrame(tick);

	return {
		subscribe(onSample, onDrop) {
			sampleListener = onSample;
			dropListener = onDrop;
		},
		stop() {
			running = false;
			cancelAnimationFrame(rafId);
		},
	};
}
