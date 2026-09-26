import { describe, expect, test } from "bun:test";
import { createCursorStatusStore } from "@/features/editor/hooks/use-cursor-status";

function subscribeCounting(store: ReturnType<typeof createCursorStatusStore>) {
	let notifications = 0;
	store.subscribe(() => {
		notifications += 1;
	});
	return () => notifications;
}

describe("createCursorStatusStore", () => {
	test("starts at line 1, column 1 with no selection", () => {
		const store = createCursorStatusStore();
		expect(store.get()).toEqual({ line: 1, column: 1 });
	});

	test("does not notify for a value-identical report (collapsed caret while typing)", () => {
		const store = createCursorStatusStore();
		const notifications = subscribeCounting(store);

		store.set({ line: 1, column: 1 });
		store.set({ line: 1, column: 1 });
		store.set({ line: 1, column: 1 });

		expect(notifications()).toBe(0);
		expect(store.get()).toEqual({ line: 1, column: 1 });
	});

	test("notifies once per actual change and keeps a stable snapshot between changes", () => {
		const store = createCursorStatusStore();
		const notifications = subscribeCounting(store);

		store.set({ line: 3, column: 7 });
		const snapshot = store.get();
		store.set({ line: 3, column: 7 });

		expect(notifications()).toBe(1);
		expect(store.get()).toBe(snapshot);
	});

	test("treats equal selection stats as identical", () => {
		const store = createCursorStatusStore();
		store.set({ line: 1, column: 1, selection: { words: 2, characters: 11 } });
		const notifications = subscribeCounting(store);

		store.set({ line: 1, column: 1, selection: { words: 2, characters: 11 } });
		expect(notifications()).toBe(0);

		store.set({ line: 1, column: 1, selection: { words: 3, characters: 15 } });
		expect(notifications()).toBe(1);
	});

	test("reset returns to the initial status and is a no-op when already there", () => {
		const store = createCursorStatusStore();
		const notifications = subscribeCounting(store);

		store.reset();
		expect(notifications()).toBe(0);

		store.set({ line: 5, column: 2 });
		store.reset();
		expect(notifications()).toBe(2);
		expect(store.get()).toEqual({ line: 1, column: 1 });
	});

	test("unsubscribe stops notifications", () => {
		const store = createCursorStatusStore();
		let notifications = 0;
		const unsubscribe = store.subscribe(() => {
			notifications += 1;
		});

		store.set({ line: 2, column: 1 });
		unsubscribe();
		store.set({ line: 3, column: 1 });

		expect(notifications).toBe(1);
	});
});
