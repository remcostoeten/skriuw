const DURATION_PATTERN = /^\s*(\d+(?:\.\d+)?)\s*(ms|s)?\s*$/i;

export const MIN_GOTO_DURATION_MS = 100;
export const MAX_GOTO_DURATION_MS = 60_000;

/**
 * Parses a user-entered duration like "2s", "2000ms", "0.2s", or a bare
 * millisecond number into milliseconds. Returns `null` for anything that
 * doesn't parse or falls outside the accepted 100ms–60s range.
 */
export function parseDurationMs(input: string): number | null {
	const match = DURATION_PATTERN.exec(input);
	if (!match) return null;

	const value = Number.parseFloat(match[1]);
	if (!Number.isFinite(value)) return null;

	const unit = (match[2] ?? "ms").toLowerCase();
	const ms = unit === "s" ? value * 1000 : value;
	if (ms < MIN_GOTO_DURATION_MS || ms > MAX_GOTO_DURATION_MS) return null;

	return Math.round(ms);
}
