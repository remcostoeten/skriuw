import { afterEach, describe, expect, test } from "bun:test";
import {
	buildNoteUrl,
	clearNoteUrl,
	updateNoteUrl,
} from "@/features/notes/hooks/use-notes-navigation";

type FakeWindow = {
	location: {
		href: string;
		pathname: string;
		search: string;
		hash: string;
	};
	history: {
		pushState: (_state: unknown, _title: string, url: string) => void;
		replaceState: (_state: unknown, _title: string, url: string) => void;
	};
};

function installWindow(path: string) {
	const calls: Array<{ mode: "push" | "replace"; url: string }> = [];
	const applyUrl = (url: string) => {
		const next = new URL(url, "https://example.test");
		fakeWindow.location.href = next.href;
		fakeWindow.location.pathname = next.pathname;
		fakeWindow.location.search = next.search;
		fakeWindow.location.hash = next.hash;
	};
	const fakeWindow: FakeWindow = {
		location: {
			href: "",
			pathname: "",
			search: "",
			hash: "",
		},
		history: {
			pushState: (_state, _title, url) => {
				calls.push({ mode: "push", url });
				applyUrl(url);
			},
			replaceState: (_state, _title, url) => {
				calls.push({ mode: "replace", url });
				applyUrl(url);
			},
		},
	};

	(globalThis as typeof globalThis & { window: FakeWindow }).window = fakeWindow;
	applyUrl(path);

	return { calls, fakeWindow };
}

afterEach(() => {
	delete (globalThis as typeof globalThis & { window?: FakeWindow }).window;
});

describe("note URL sync helpers", () => {
	test("builds a relative canonical note URL while preserving other params", () => {
		expect(buildNoteUrl("note-b", "https://example.test/app?view=all#top")).toBe(
			"/app?view=all&note=note-b#top",
		);
	});

	test("pushes or replaces only when the note URL changes", () => {
		const { calls } = installWindow("/app?view=all&note=note-a#top");

		expect(updateNoteUrl("note-a")).toBe(false);
		expect(calls).toEqual([]);

		expect(updateNoteUrl("note-b")).toBe(true);
		expect(updateNoteUrl("note-c", { mode: "replace" })).toBe(true);

		expect(calls).toEqual([
			{ mode: "push", url: "/app?view=all&note=note-b#top" },
			{ mode: "replace", url: "/app?view=all&note=note-c#top" },
		]);
	});

	test("clears stale note params with replace by default", () => {
		const { calls } = installWindow("/app?note=missing&view=all");

		expect(clearNoteUrl()).toBe(true);
		expect(clearNoteUrl()).toBe(false);

		expect(calls).toEqual([{ mode: "replace", url: "/app?view=all" }]);
	});
});
