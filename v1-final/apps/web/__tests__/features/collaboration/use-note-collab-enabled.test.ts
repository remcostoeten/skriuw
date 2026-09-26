import { describe, expect, test } from "bun:test";
import { shouldQueryNoteCollaborators } from "@/features/collaboration/hooks/should-query-note-collaborators";

describe("shouldQueryNoteCollaborators", () => {
	test("never sends guest note ids to authenticated collaboration actions", () => {
		expect(shouldQueryNoteCollaborators("guest:note-welcome", undefined, true)).toBe(false);
	});

	test("queries only owner-side cloud notes when collaboration is configured", () => {
		expect(shouldQueryNoteCollaborators("note-id", undefined, true)).toBe(true);
		expect(shouldQueryNoteCollaborators("note-id", "owner", true)).toBe(true);
		expect(shouldQueryNoteCollaborators("note-id", "editor", true)).toBe(false);
		expect(shouldQueryNoteCollaborators("note-id", "viewer", true)).toBe(false);
		expect(shouldQueryNoteCollaborators("note-id", undefined, false)).toBe(false);
	});
});
