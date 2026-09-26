import { afterEach, describe, expect, test } from "bun:test";
import { focusActiveEditor } from "@/shared/lib/focus-editor";

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;

afterEach(() => {
	Object.assign(globalThis, {
		document: originalDocument,
		window: originalWindow,
	});
});

describe("focusActiveEditor", () => {
	test("places a block editor caret at the document start", () => {
		const calls: unknown[] = [];
		const rich = { focus: () => calls.push("focus") };
		const range = {
			selectNodeContents: (node: unknown) => calls.push(["select", node]),
			collapse: (toStart: boolean) => calls.push(["collapse", toStart]),
		};
		const selection = {
			removeAllRanges: () => calls.push("clear"),
			addRange: (nextRange: unknown) => calls.push(["add", nextRange]),
		};
		const documentStub = {
			querySelector: (selector: string) =>
				selector.includes("contenteditable") ? rich : null,
			createRange: () => range,
		};
		Object.assign(globalThis, {
			document: documentStub,
			window: { getSelection: () => selection },
		});

		expect(focusActiveEditor()).toBe(true);
		expect(calls).toContainEqual(["select", rich]);
		expect(calls).toContainEqual(["collapse", true]);
		expect(calls).toContainEqual(["add", range]);
	});

	test("places a raw editor caret at offset zero", () => {
		const selections: Array<[number, number]> = [];
		const plain = {
			focus: () => undefined,
			setSelectionRange: (start: number, end: number) => selections.push([start, end]),
		};
		Object.assign(globalThis, {
			document: {
				querySelector: (selector: string) =>
					selector === "[data-editor-surface]" ? plain : null,
			},
			window: {},
		});

		expect(focusActiveEditor()).toBe(true);
		expect(selections).toEqual([[0, 0]]);
	});
});
