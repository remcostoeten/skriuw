import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { recordGuestGraphExplore } from "@/core/workspace-backend/guest-graph-engagement";
import { GUEST_SIGNUP_PROMPT_EVENT } from "@/core/workspace-backend/local-backend";

function createStorage() {
	const entries = new Map<string, string>();
	return {
		getItem: (key: string) => entries.get(key) ?? null,
		setItem: (key: string, value: string) => void entries.set(key, value),
		removeItem: (key: string) => void entries.delete(key),
		clear: () => entries.clear(),
	};
}

function installWindow() {
	const localStorage = createStorage();
	const target = new EventTarget();
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: {
			localStorage,
			addEventListener: target.addEventListener.bind(target),
			removeEventListener: target.removeEventListener.bind(target),
			dispatchEvent: target.dispatchEvent.bind(target),
		},
	});
	return { localStorage };
}

describe("recordGuestGraphExplore", () => {
	beforeEach(() => {
		installWindow();
	});

	afterEach(() => {
		Reflect.deleteProperty(globalThis, "window");
	});

	test("dispatches signup prompt at exploration thresholds", () => {
		const events: number[] = [];

		function handlePrompt(event: Event) {
			const detail = (event as CustomEvent<{ count: number }>).detail;
			events.push(detail.count);
		}

		window.addEventListener(GUEST_SIGNUP_PROMPT_EVENT, handlePrompt);
		try {
			recordGuestGraphExplore();
			recordGuestGraphExplore();
			expect(events).toEqual([]);

			recordGuestGraphExplore();
			expect(events).toEqual([3]);
		} finally {
			window.removeEventListener(GUEST_SIGNUP_PROMPT_EVENT, handlePrompt);
		}
	});
});
