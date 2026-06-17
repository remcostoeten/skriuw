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

export function isPerfEnabled(): boolean {
	return enabled;
}

export function clearSamples(): void {
	samples.clear();
	pendingOpens.clear();
}

function dump(): void {
	if (!isBrowser()) return;
	// eslint-disable-next-line no-console
	console.log("%c[skriuw perf] all values in ms", "font-weight:bold");
	// eslint-disable-next-line no-console
	console.table(getSummaryRows());
}

if (isBrowser()) {
	(window as unknown as { __skriuwPerf?: unknown }).__skriuwPerf = {
		dump,
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
