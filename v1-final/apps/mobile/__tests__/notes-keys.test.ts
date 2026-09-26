import { describe, expect, test } from "bun:test";
import { notesKeys } from "@/query/notes-keys";

describe("notes query keys", () => {
	test("keeps the all-notes cache separate from root notes", () => {
		expect(notesKeys.files()).toEqual(["notes", "files", "all"]);
		expect(notesKeys.files(null)).toEqual(["notes", "files", "root"]);
		expect(notesKeys.files()).not.toEqual(notesKeys.files(null));
	});
});
