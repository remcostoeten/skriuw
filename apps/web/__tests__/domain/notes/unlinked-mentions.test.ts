import { describe, expect, test } from "bun:test";
import {
	findUnlinkedMentions,
	linkifyFirstMention,
} from "@/domain/notes/unlinked-mentions";
import type { NoteFile } from "@/types/notes";

function note(input: Partial<NoteFile> & Pick<NoteFile, "id" | "name" | "content">): NoteFile {
	const now = new Date("2026-05-07T10:00:00.000Z");

	return {
		richContent: [],
		preferredEditorMode: "raw",
		createdAt: now,
		modifiedAt: now,
		parentId: null,
		...input,
	};
}

describe("findUnlinkedMentions", () => {
	const active = note({ id: "a", name: "Project Atlas.md", content: "# Project Atlas\n\nHome." });

	test("surfaces plain-text mentions of the title", () => {
		const other = note({
			id: "b",
			name: "Notes.md",
			content: "Met about Project Atlas today. Project Atlas rocks.",
		});

		const mentions = findUnlinkedMentions(active, [active, other]);
		expect(mentions).toHaveLength(1);
		expect(mentions[0].noteId).toBe("b");
		expect(mentions[0].count).toBe(2);
		expect(mentions[0].phrase).toBe("Project Atlas");
	});

	test("ignores existing wiki links and code spans", () => {
		const other = note({
			id: "b",
			name: "Notes.md",
			content: "See [[Project Atlas]] and `Project Atlas` snippet.",
		});

		expect(findUnlinkedMentions(active, [active, other])).toHaveLength(0);
	});

	test("does not match inside a larger word", () => {
		const other = note({ id: "b", name: "Notes.md", content: "Project Atlases are plural." });
		expect(findUnlinkedMentions(active, [active, other])).toHaveLength(0);
	});
});

describe("linkifyFirstMention", () => {
	test("wraps the first standalone occurrence only", () => {
		expect(linkifyFirstMention("Project Atlas and Project Atlas", "Project Atlas")).toBe(
			"[[Project Atlas]] and Project Atlas",
		);
	});

	test("skips occurrences already inside a link", () => {
		expect(linkifyFirstMention("[[Project Atlas]] then Project Atlas", "Project Atlas")).toBe(
			"[[Project Atlas]] then [[Project Atlas]]",
		);
	});

	test("returns null when nothing linkable is found", () => {
		expect(linkifyFirstMention("nothing here", "Project Atlas")).toBeNull();
	});
});
