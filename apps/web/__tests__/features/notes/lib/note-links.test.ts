import { describe, expect, test } from "bun:test";
import {
	buildNoteBacklinks,
	buildNoteLinkIndex,
	buildOutgoingNoteLinks,
	deriveNoteNameFromHeading,
	extractNoteLinks,
	extractNoteTags,
	isUntitledNoteName,
	findNoteByTitle,
	getNoteSearchableContent,
	getNoteTitle,
	getWorkspaceTags,
} from "@/domain/notes/note-links";
import { setTagDetectionEnabled } from "@/domain/notes/tag-detection";
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

describe("note link indexing", () => {
	test("extracts tags without reading code spans", () => {
		expect(extractNoteTags("Ship #writing and #Product\n`#ignored`")).toEqual([
			"product",
			"writing",
		]);
	});

	test("extracts nothing while tag detection is disabled", () => {
		setTagDetectionEnabled(false);
		try {
			expect(extractNoteTags("#Some comment\nDB_URL=postgres://x #legacy")).toEqual([]);
		} finally {
			setTagDetectionEnabled(true);
		}
		expect(extractNoteTags("#Some comment")).toEqual(["some"]);
	});

	test("extracts wiki links and internal markdown note links", () => {
		expect(
			extractNoteLinks(
				note({
					id: "source",
					name: "Source.md",
					content: "See [[Target note|target]] and [Target](note://target-id).",
				}),
			),
		).toMatchObject([
			{
				kind: "wiki",
				targetLabel: "Target note",
				alias: "target",
			},
			{
				kind: "markdown-note-link",
				targetLabel: "Target",
				targetNoteId: "target-id",
			},
		]);
	});

	test("finds a unique note by title", () => {
		const target = note({ id: "target-id", name: "Target note.md", content: "# Target" });
		const other = note({ id: "other-id", name: "Other.md", content: "# Other" });

		expect(findNoteByTitle([target, other], "Target note")).toMatchObject({
			id: "target-id",
		});
		expect(findNoteByTitle([target, other], "Missing")).toBeNull();
	});

	test("builds outgoing links and backlinks", () => {
		const target = note({ id: "target-id", name: "Target note.md", content: "#target" });
		const source = note({
			id: "source-id",
			name: "Source.md",
			content: "Backlink to [[Target note]].",
		});

		const index = buildNoteLinkIndex(target, [target, source]);

		expect(index.backlinks).toHaveLength(1);
		expect(index.backlinks[0]).toMatchObject({
			sourceNoteId: "source-id",
			targetNoteId: "target-id",
			status: "resolved",
		});
	});

	test("builds outgoing links without backlink sources", () => {
		const target = note({
			id: "target-id",
			name: "Target.md",
			content: "# Target\n\nSee [[Source]].",
		});
		const source = note({
			id: "source-id",
			name: "Source.md",
			content: "# Source\n\nBacklink to [[Target]].",
		});

		const outgoing = buildOutgoingNoteLinks(target, [target, source]);

		expect(outgoing).toHaveLength(1);
		expect(outgoing[0]).toMatchObject({
			sourceNoteId: "target-id",
			targetNoteId: "source-id",
			status: "resolved",
		});
	});

	test("dedupes repeated outgoing and backlink targets", () => {
		const handbook = note({
			id: "handbook-id",
			name: "Skriuw handbook.md",
			content:
				"# Skriuw handbook\n\nSee [[Welcome to Skriuw]] and again [[Welcome to Skriuw]].",
		});
		const welcome = note({
			id: "welcome-id",
			name: "Welcome to Skriuw.md",
			content:
				"# Welcome\n\nOpen [[Skriuw handbook]] and [[Skriuw handbook]] and [[Skriuw handbook]].",
		});

		expect(buildOutgoingNoteLinks(handbook, [handbook, welcome])).toHaveLength(1);
		expect(buildNoteBacklinks(handbook, [handbook, welcome])).toHaveLength(1);
		expect(buildOutgoingNoteLinks(handbook, [handbook, welcome])[0]).toMatchObject({
			targetNoteId: "welcome-id",
		});
		expect(buildNoteBacklinks(handbook, [handbook, welcome])[0]).toMatchObject({
			sourceNoteId: "welcome-id",
		});
	});

	test("ignores self-referential outgoing links", () => {
		const handbook = note({
			id: "handbook-id",
			name: "Skriuw handbook.md",
			content: "# Skriuw handbook\n\nSee [[Skriuw handbook]] for details.",
		});

		expect(buildOutgoingNoteLinks(handbook, [handbook])).toHaveLength(0);
	});

	test("builds backlinks with a single note graph pass", () => {
		const target = note({
			id: "target-id",
			name: "Target.md",
			content: "# Target\n\n",
		});
		const source = note({
			id: "source-id",
			name: "Source.md",
			content: "# Source\n\nBacklink to [[Target]].",
		});

		const backlinks = buildNoteBacklinks(target, [target, source]);

		expect(backlinks).toHaveLength(1);
		expect(backlinks[0]).toMatchObject({
			sourceNoteId: "source-id",
			targetNoteId: "target-id",
			status: "resolved",
		});
	});

	test("counts a shared-title wiki link as a backlink of every match", () => {
		const first = note({ id: "dup-1", name: "Dup.md", content: "# Dup\n\nFirst." });
		const second = note({ id: "dup-2", name: "Dup.md", content: "# Dup\n\nSecond." });
		const source = note({
			id: "source-id",
			name: "Source.md",
			content: "# Source\n\nSee [[Dup]].",
		});

		const files = [first, second, source];
		expect(buildNoteBacklinks(first, files)).toMatchObject([
			{ sourceNoteId: "source-id", targetNoteId: "dup-1", status: "resolved" },
		]);
		expect(buildNoteBacklinks(second, files)).toMatchObject([
			{ sourceNoteId: "source-id", targetNoteId: "dup-2", status: "resolved" },
		]);
	});

	test("resolves links against markdown headings as note titles", () => {
		const target = note({
			id: "target-id",
			name: "Start here - editor field guide.md",
			content: "# Start here: editor field guide\n\nWelcome.",
		});
		const source = note({
			id: "source-id",
			name: "Source.md",
			content: "Backlink to [[Start here: editor field guide]].",
		});

		const index = buildNoteLinkIndex(target, [target, source]);

		expect(getNoteTitle(target)).toBe("Start here: editor field guide");
		expect(index.backlinks[0]).toMatchObject({
			sourceNoteId: "source-id",
			targetNoteId: "target-id",
			status: "resolved",
		});
	});

	test("uses mdx filenames as fallback titles", () => {
		expect(getNoteTitle(note({ id: "mdx", name: "Component gallery.mdx", content: "" }))).toBe(
			"Component gallery",
		);
	});

	test("collects workspace tags from explicit tags and content tags", () => {
		expect(
			getWorkspaceTags([
				note({ id: "a", name: "A.md", content: "#draft", tags: ["manual"] }),
				note({ id: "b", name: "B.md", content: "#idea #manual" }),
			]),
		).toEqual(["draft", "idea", "manual"]);
	});

	test("extracts links and tags from rich content when markdown content is empty", () => {
		const target = note({
			id: "target-id",
			name: "Project hub.md",
			content: "",
			richContent: [
				{
					id: "h1",
					type: "heading",
					props: { level: 1 },
					content: [t("Project hub")],
					children: [],
				},
			],
		});
		const source = note({
			id: "source-id",
			name: "Linking demo.md",
			content: "",
			richContent: [
				{
					id: "p1",
					type: "paragraph",
					props: {},
					content: [
						{ type: "text", text: "See ", styles: {} },
						{ type: "noteLink", props: { title: "Project hub" } },
						{ type: "text", text: " and ", styles: {} },
						{ type: "tag", props: { name: "example" } },
					],
					children: [],
				},
			],
		});

		expect(extractNoteLinks(source)).toMatchObject([
			{
				kind: "wiki",
				targetLabel: "Project hub",
			},
		]);
		expect(extractNoteTags(getNoteSearchableContent(source))).toEqual(["example"]);

		const index = buildNoteLinkIndex(target, [target, source]);
		expect(index.backlinks).toHaveLength(1);
		expect(index.backlinks[0]).toMatchObject({
			sourceNoteId: "source-id",
			targetNoteId: "target-id",
			status: "resolved",
		});
	});

	test("merges rich-content chips when markdown content dropped them (desktop vault)", () => {
		const source = note({
			id: "source-id",
			name: "Linking demo.md",
			content: "Some body text without the serialized link forms.",
			richContent: [
				{
					id: "p1",
					type: "paragraph",
					props: {},
					content: [
						{
							type: "text",
							text: "Some body text without the serialized link forms. ",
							styles: {},
						},
						{ type: "noteLink", props: { title: "Project hub" } },
						{ type: "text", text: " and ", styles: {} },
						{
							type: "link",
							href: "note://target-id",
							content: [{ type: "text", text: "Target", styles: {} }],
						},
					],
					children: [],
				},
			],
		});

		expect(extractNoteLinks(source)).toMatchObject([
			{ kind: "wiki", targetLabel: "Project hub" },
			{ kind: "markdown-note-link", targetLabel: "Target", targetNoteId: "target-id" },
		]);
	});
});

describe("isUntitledNoteName", () => {
	test("matches auto-generated names regardless of suffix or case", () => {
		expect(isUntitledNoteName("Untitled.md")).toBe(true);
		expect(isUntitledNoteName("Untitled 2.md")).toBe(true);
		expect(isUntitledNoteName("untitled.md")).toBe(true);
		expect(isUntitledNoteName(" Untitled.md ")).toBe(true);
	});

	test("does not match user-chosen names", () => {
		expect(isUntitledNoteName("My note.md")).toBe(false);
		expect(isUntitledNoteName("Untitled thoughts.md")).toBe(false);
		expect(isUntitledNoteName("Untitled2.md")).toBe(false);
	});
});

describe("deriveNoteNameFromHeading", () => {
	test("derives a .md filename from the first H1", () => {
		expect(deriveNoteNameFromHeading("# Meeting notes\n\nbody")).toBe("Meeting notes.md");
	});

	test("ignores headings inside fenced code and deeper levels", () => {
		expect(deriveNoteNameFromHeading("```\n# fake\n```\n## Real?\nbody")).toBeNull();
	});

	test("sanitizes filesystem-unsafe characters and collapses whitespace", () => {
		expect(deriveNoteNameFromHeading("#   Q1/Q2:  plan?  ")).toBe("Q1 Q2 plan.md");
	});

	test("returns null when there is no heading", () => {
		expect(deriveNoteNameFromHeading("just a paragraph")).toBeNull();
	});

	test("returns null when the heading sanitizes to nothing", () => {
		expect(deriveNoteNameFromHeading("# ///")).toBeNull();
	});
});

function t(text: string, styles: Record<string, unknown> = {}) {
	return { type: "text", text, styles };
}
