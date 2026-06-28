import { noop } from "@/shared/lib/noop";

const ENTER_CLASS = "skriuw-ai-diff";
const LEAVING_CLASS = "skriuw-ai-diff--leaving";

const MIN_VISIBLE_MS = 2000;
const SETTLE_MS = 1000;
const FADE_MS = 600;
const ACTIVITY_THROTTLE_MS = 120;

const ACTIVITY_EVENTS = [
	"mousemove",
	"pointerdown",
	"keydown",
	"wheel",
	"touchstart",
	"scroll",
] as const;

export type AiDiffHighlightHandle = {
	cancel: () => void;
};

/**
 * Paints a transient, view-only highlight over the given editor elements to
 * showcase what an AI action just changed. It never mutates the document, so
 * nothing is serialized, saved, or synced — the highlight lives purely in the
 * DOM and removes itself.
 *
 * Timing follows an idle-aware fade: the highlight stays for at least
 * {@link MIN_VISIBLE_MS}, and only fades once user activity (mouse, keyboard,
 * scroll, touch) settles for {@link SETTLE_MS}. If the user walks away and no
 * activity is ever registered, the highlight persists until they return — so a
 * change is never missed.
 */
export function showAiDiffHighlight(elements: HTMLElement[]): AiDiffHighlightHandle {
	const targets = elements.filter((el) => el.isConnected);
	if (targets.length === 0) {
		return { cancel: noop };
	}

	const startedAt = performance.now();
	let fadeTimer: number | null = null;
	let removalTimer: number | null = null;
	let lastActivityScheduledAt = 0;
	let finished = false;

	for (const el of targets) {
		el.classList.remove(LEAVING_CLASS);
		el.classList.add(ENTER_CLASS);
	}

	const reassertUntil = startedAt + 1500;
	const reassert = () => {
		if (finished) return;
		for (const el of targets) {
			if (el.isConnected && !el.classList.contains(ENTER_CLASS)) {
				el.classList.add(ENTER_CLASS);
			}
		}
		if (performance.now() < reassertUntil) requestAnimationFrame(reassert);
	};
	requestAnimationFrame(reassert);

	function teardownListeners() {
		for (const eventName of ACTIVITY_EVENTS) {
			window.removeEventListener(eventName, handleActivity, true);
		}
	}

	function clearClasses() {
		for (const el of targets) {
			el.classList.remove(ENTER_CLASS, LEAVING_CLASS);
		}
	}

	function fadeOut() {
		if (finished) return;
		finished = true;
		teardownListeners();
		if (fadeTimer !== null) window.clearTimeout(fadeTimer);
		for (const el of targets) {
			el.classList.add(LEAVING_CLASS);
		}
		removalTimer = window.setTimeout(clearClasses, FADE_MS);
	}

	function scheduleFade() {
		if (finished) return;
		const elapsed = performance.now() - startedAt;
		const delay = Math.max(SETTLE_MS, MIN_VISIBLE_MS - elapsed);
		if (fadeTimer !== null) window.clearTimeout(fadeTimer);
		fadeTimer = window.setTimeout(fadeOut, delay);
	}

	const handleActivity = () => {
		const now = performance.now();
		if (now - lastActivityScheduledAt < ACTIVITY_THROTTLE_MS) return;
		lastActivityScheduledAt = now;
		scheduleFade();
	};

	for (const eventName of ACTIVITY_EVENTS) {
		window.addEventListener(eventName, handleActivity, { capture: true, passive: true });
	}

	function cancel() {
		if (fadeTimer !== null) window.clearTimeout(fadeTimer);
		if (removalTimer !== null) window.clearTimeout(removalTimer);
		teardownListeners();
		clearClasses();
		finished = true;
	}

	return { cancel };
}

/**
 * Returns the indices in `after` that are not part of the longest common
 * subsequence with `before` — i.e. the lines that were added or rewritten.
 * Block-level diff for highlighting what an in-place AI edit (spell check)
 * changed, robust to inserted/removed blocks rather than naive positional
 * comparison.
 */
export function diffChangedIndices(before: string[], after: string[]): number[] {
	const n = before.length;
	const m = after.length;
	const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			lcs[i][j] =
				before[i] === after[j]
					? lcs[i + 1][j + 1] + 1
					: Math.max(lcs[i + 1][j], lcs[i][j + 1]);
		}
	}

	const matched = new Set<number>();
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (before[i] === after[j]) {
			matched.add(j);
			i++;
			j++;
		} else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
			i++;
		} else {
			j++;
		}
	}

	const changed: number[] = [];
	for (let k = 0; k < m; k++) {
		if (!matched.has(k)) changed.push(k);
	}
	return changed;
}

function blockSimilarity(a: string, b: string): number {
	if (a === b) return 1;
	const tokensA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
	const tokensB = b.toLowerCase().split(/\s+/).filter(Boolean);
	if (tokensA.size === 0 && tokensB.length === 0) return 1;
	let overlap = 0;
	for (const token of tokensB) {
		if (tokensA.has(token)) overlap += 1;
	}
	const denom = Math.max(tokensA.size, tokensB.length) || 1;
	return overlap / denom;
}

/**
 * Maps each original block to the single best-matching corrected block, in
 * order, and returns the chosen corrected indices. Any blocks the AI inserted
 * are dropped, so a spell-check can never add paragraphs — it can only correct
 * the text of blocks that already existed.
 *
 * Only meaningful when `afterTexts` has more blocks than `beforeTexts` (the AI
 * invented content); callers should apply the corrected document as-is
 * otherwise.
 */
export function selectCorrectedIndices(beforeTexts: string[], afterTexts: string[]): number[] {
	const n = beforeTexts.length;
	const m = afterTexts.length;
	if (m <= n) return afterTexts.map((_, k) => k);

	const NEG = Number.NEGATIVE_INFINITY;
	const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(NEG));
	for (let j = 0; j <= m; j++) dp[n][j] = 0;
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			const matchScore = blockSimilarity(beforeTexts[i], afterTexts[j]) + dp[i + 1][j + 1];
			const skipScore = m - (j + 1) >= n - i ? dp[i][j + 1] : NEG;
			dp[i][j] = Math.max(matchScore, skipScore);
		}
	}

	const chosen: number[] = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		const matchScore = blockSimilarity(beforeTexts[i], afterTexts[j]) + dp[i + 1][j + 1];
		const skipScore = m - (j + 1) >= n - i ? dp[i][j + 1] : NEG;
		if (matchScore >= skipScore) {
			chosen.push(j);
			i += 1;
		}
		j += 1;
	}
	return chosen;
}
