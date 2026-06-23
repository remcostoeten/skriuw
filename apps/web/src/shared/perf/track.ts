/**
 * Lightweight, dev-only interaction-perf tracker for the notes workspace.
 *
 * Answers the questions that "feels instant" actually depends on:
 *   - note-open  : time from selecting a note to its body being painted,
 *                  split by whether the body was already cached (warm) or
 *                  had to be fetched (cold).
 *   - serialize  : main-thread cost of serializing the editor document on a
 *                  save settle (the work we moved off the per-keystroke path).
 *
 * Zero cost in production: every entry point no-ops unless tracking is enabled.
 * Enable in a running session via the browser console: `__skriuwPerf.enable()`,
 * then interact and run `__skriuwPerf.dump()` to print a percentile summary.
 * In development it is on by default.
 */

type TSample = { value: number; meta?: Record<string, unknown> };

const STORE_KEY = "skriuw:perf";
const MAX_SAMPLES = 500;

const samples = new Map<string, TSample[]>();
const pendingOpens = new Map<string, { t0: number; cacheHit: boolean }>();

function isBrowser(): boolean {
	return typeof window !== "undefined";
}

function readEnabled(): boolean {
	if (!isBrowser()) return false;
	try {
		const stored = window.localStorage.getItem(STORE_KEY);
		if (stored === "1") return true;
		if (stored === "0") return false;
	} catch {
		// localStorage can throw in private mode — fall through to the default.
	}
	return process.env.NODE_ENV !== "production";
}

let enabled = readEnabled();

function record(metric: string, value: number, meta?: Record<string, unknown>): void {
	if (!enabled) return;
	const list = samples.get(metric) ?? [];
	list.push({ value, meta });
	if (list.length > MAX_SAMPLES) list.shift();
	samples.set(metric, list);
}

/**
 * Passive browser observers — they record nothing unless tracking is enabled
 * (record() gates on `enabled`), so they're free in production.
 *  - interaction: input→next-paint latency for clicks/keystrokes (INP-style).
 *  - long-task:   main-thread blocks >50ms, i.e. the jank a user actually feels.
 */
function initObservers(): void {
	if (!isBrowser() || typeof PerformanceObserver === "undefined") return;

	try {
		const io = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				// Only interactions (have an interactionId); ignore passive events.
				const interactionId =
					(entry as PerformanceEntry & { interactionId?: number }).interactionId ?? 0;
				if (interactionId > 0) record("interaction", entry.duration, { type: entry.name });
			}
		});
		// durationThreshold 40ms ≈ skips sub-frame noise, keeps anything felt.
		io.observe({ type: "event", buffered: true, durationThreshold: 40 } as PerformanceObserverInit);
	} catch {
		// 'event' timing unsupported — skip.
	}

	try {
		const lo = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) record("long-task", entry.duration);
		});
		lo.observe({ type: "longtask", buffered: true });
	} catch {
		// longtask unsupported (e.g. Safari) — skip.
	}
}

function percentile(sorted: number[], p: number): number {
	if (sorted.length === 0) return 0;
	const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
	return sorted[idx];
}

function summarize(values: number[]) {
	const sorted = [...values].sort((a, b) => a - b);
	const sum = sorted.reduce((acc, v) => acc + v, 0);
	return {
		count: sorted.length,
		p50: round(percentile(sorted, 50)),
		p95: round(percentile(sorted, 95)),
		min: round(sorted[0] ?? 0),
		max: round(sorted[sorted.length - 1] ?? 0),
		mean: round(sum / (sorted.length || 1)),
	};
}

function round(n: number): number {
	return Math.round(n * 10) / 10;
}

export const perf = {
	/** Mark the moment a note is selected. `cacheHit` = body already in cache. */
	openStart(id: string, cacheHit: boolean): void {
		if (!enabled || !id) return;
		pendingOpens.set(id, { t0: performance.now(), cacheHit });
	},

	/** Mark the moment the selected note's body is on screen. */
	openEnd(id: string): void {
		if (!enabled || !id) return;
		const pending = pendingOpens.get(id);
		if (!pending) return;
		pendingOpens.delete(id);
		record("note-open", performance.now() - pending.t0, { cacheHit: pending.cacheHit });
	},

	/** Record the duration of a synchronous/awaited serialize-commit pass. */
	serialize(durationMs: number): void {
		record("serialize", durationMs);
	},
} as const;

export type TPerfSummary = ReturnType<typeof summarize>;

/**
 * Snapshot of the current samples, summarized per metric, with note-open split
 * into warm (cached) vs cold (fetched). Shared by the console dump() and the
 * on-screen dev overlay so both show identical numbers.
 */
export function getSummaryRows(): Record<string, TPerfSummary> {
	const rows: Record<string, TPerfSummary> = {};
	for (const [metric, list] of samples) {
		if (metric === "note-open") continue;
		rows[metric] = summarize(list.map((s) => s.value));
	}
	const opens = samples.get("note-open") ?? [];
	const warm = opens.filter((s) => s.meta?.cacheHit).map((s) => s.value);
	const cold = opens.filter((s) => !s.meta?.cacheHit).map((s) => s.value);
	if (warm.length) rows["note-open (warm)"] = summarize(warm);
	if (cold.length) rows["note-open (cold)"] = summarize(cold);
	return rows;
}

export type TPerfHeadline = {
	cacheHitRate: number | null;
	warmCount: number;
	coldCount: number;
	worstInteraction: number;
	longTaskCount: number;
	verdict: "instant" | "good" | "janky" | "idle";
};

/**
 * High-signal headline numbers. cacheHitRate answers "is the warmup working?";
 * worstInteraction is the felt input lag (INP-style); verdict is a single-word
 * read derived from warm-open p95 + worst interaction.
 */
export function getHeadline(): TPerfHeadline {
	const opens = samples.get("note-open") ?? [];
	const warm = opens.filter((s) => s.meta?.cacheHit);
	const cold = opens.filter((s) => !s.meta?.cacheHit);
	const total = opens.length;

	const interactions = (samples.get("interaction") ?? []).map((s) => s.value);
	const worstInteraction = interactions.length ? round(Math.max(...interactions)) : 0;
	const longTaskCount = (samples.get("long-task") ?? []).length;

	const warmP95 = warm.length
		? round(percentile(warm.map((s) => s.value).sort((a, b) => a - b), 95))
		: 0;

	let verdict: TPerfHeadline["verdict"] = "idle";
	if (total > 0 || interactions.length > 0) {
		const sluggish = warmP95 > 150 || worstInteraction > 500;
		const fast = warmP95 <= 50 && worstInteraction <= 200;
		verdict = sluggish ? "janky" : fast ? "instant" : "good";
	}

	return {
		cacheHitRate: total > 0 ? Math.round((warm.length / total) * 100) : null,
		warmCount: warm.length,
		coldCount: cold.length,
		worstInteraction,
		longTaskCount,
		verdict,
	};
}

export function isPerfEnabled(): boolean {
	return enabled;
}

export function clearSamples(): void {
	samples.clear();
	pendingOpens.clear();
}

function dump(): void {
	if (!isBrowser()) return;
	const h = getHeadline();
	// eslint-disable-next-line no-console
	console.log(
		`%c[skriuw perf] ${h.verdict} · cache-hit ${h.cacheHitRate ?? "—"}% · worst-INP ${h.worstInteraction}ms · long-tasks ${h.longTaskCount}`,
		"font-weight:bold",
	);
	// eslint-disable-next-line no-console
	console.table(getSummaryRows());
}

if (isBrowser()) {
	initObservers();
	(window as unknown as { __skriuwPerf?: unknown }).__skriuwPerf = {
		dump,
		headline: getHeadline,
		clear: clearSamples,
		enable: () => {
			enabled = true;
			try {
				window.localStorage.setItem(STORE_KEY, "1");
			} catch {}
			// eslint-disable-next-line no-console
			console.log("[skriuw perf] enabled — interact, then __skriuwPerf.dump()");
		},
		disable: () => {
			enabled = false;
			try {
				window.localStorage.setItem(STORE_KEY, "0");
			} catch {}
		},
		get enabled() {
			return enabled;
		},
	};
}
