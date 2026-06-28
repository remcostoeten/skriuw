import { describe, expect, test } from "bun:test";
import { notesKeys } from "@/features/notes/lib/notes-keys";

describe("notesKeys", () => {
	test("separates local and authenticated note list caches", () => {
		expect(notesKeys.files("local")).toEqual(["notes", "files", "local"]);
		expect(notesKeys.files("user:user-a")).toEqual(["notes", "files", "user:user-a"]);
		expect(notesKeys.folders("local")).toEqual(["notes", "folders", "local"]);
		expect(notesKeys.folders("user:user-a")).toEqual(["notes", "folders", "user:user-a"]);
		expect(notesKeys.graph("user:user-a")).toEqual(["notes", "graph", "user:user-a"]);
		expect(notesKeys.trash("user:user-a")).toEqual(["notes", "trash", "user:user-a"]);
	});

	test("keeps base list keys available for prefix invalidation", () => {
		expect(notesKeys.files()).toEqual(["notes", "files"]);
		expect(notesKeys.folders()).toEqual(["notes", "folders"]);
		expect(notesKeys.graph()).toEqual(["notes", "graph"]);
		expect(notesKeys.trash()).toEqual(["notes", "trash"]);
	});
});
