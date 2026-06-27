import { GUEST_SIGNUP_PROMPT_EVENT } from "./local-backend";
import { noop } from "@/shared/lib/noop";

const GRAPH_EXPLORE_STORAGE_KEY = "skriuw:guest:graph-explore:v1";
/** Node opens at which we nudge guests toward creating an account. */
const GRAPH_EXPLORE_THRESHOLDS = [3, 8] as const;

function isBrowser(): boolean {
	return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Counts note-node opens in the demo graph and surfaces the signup prompt at thresholds. */
export function recordGuestGraphExplore(): void {
	if (!isBrowser()) return;

	try {
		const raw = window.localStorage.getItem(GRAPH_EXPLORE_STORAGE_KEY);
		const previous = raw ? Number.parseInt(raw, 10) : 0;
		const next = (Number.isFinite(previous) ? previous : 0) + 1;
		window.localStorage.setItem(GRAPH_EXPLORE_STORAGE_KEY, String(next));

		if ((GRAPH_EXPLORE_THRESHOLDS as readonly number[]).includes(next)) {
			window.dispatchEvent(
				new CustomEvent(GUEST_SIGNUP_PROMPT_EVENT, {
					detail: { count: next, source: "graph" },
				}),
			);
		}
	} catch {
		// ignore storage failures
		noop();
	}
}
