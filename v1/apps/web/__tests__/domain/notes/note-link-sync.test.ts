import { describe, expect, test } from "bun:test";
import type { Prisma } from "@/generated/prisma/client";
import {
	buildDesiredNoteLinkRows,
	diffNoteLinkRows,
	type NoteLinkSyncDb,
	type PersistedNoteLinkRow,
	syncNoteLinks,
} from "@/domain/notes/note-link-sync";

function row(
	id: string,
	kind: string,
	targetLabel: string,
	targetNoteId: string | null = null,
): PersistedNoteLinkRow {
	return { id, kind, targetLabel, targetNoteId };
}

function createDb(existing: PersistedNoteLinkRow[]): {
	db: NoteLinkSyncDb;
	writes: string[];
	rows: PersistedNoteLinkRow[];
} {
	const rows = [...existing];
	const writes: string[] = [];

	return {
		rows,
		writes,
		db: {
			noteLink: {
				async findMany() {
					return [...rows];
				},
				async deleteMany(args) {
					writes.push("deleteMany");
					const keys = new Set(
						args.where.OR.map((item) => `${item.kind}:${item.targetLabel}`),
					);
					let count = 0;
					for (let index = rows.length - 1; index >= 0; index -= 1) {
						if (keys.has(`${rows[index].kind}:${rows[index].targetLabel}`)) {
							rows.splice(index, 1);
							count += 1;
						}
					}
					return { count };
				},
				async updateMany(args) {
					writes.push("updateMany");
					let count = 0;
					for (const item of rows) {
						if (args.where.id.in.includes(item.id)) {
							item.targetNoteId = args.data.targetNoteId;
							count += 1;
						}
					}
					return { count };
				},
				async createMany(args) {
					writes.push("createMany");
					for (const item of args.data) {
						rows.push({
							id: `created-${rows.length}`,
							kind: item.kind,
							targetLabel: item.targetLabel,
							targetNoteId: item.targetNoteId ?? null,
						});
					}
					return { count: args.data.length };
				},
			},
			person: {
				async findMany() {
					return [];
				},
				async create(args) {
					return { id: `person-${args.data.name}`, name: args.data.name };
				},
			},
		},
	};
}

describe("note link sync", () => {
	test("builds canonical outgoing link and tag rows", () => {
		const rows = buildDesiredNoteLinkRows("user-1", {
			id: "note-1",
			content: "[[Alpha.md]] #Idea",
			richContent: [],
			tags: ["#Pinned", "idea"],
		});

		expect(rows).toEqual([
			{
				userId: "user-1",
				sourceNoteId: "note-1",
				targetNoteId: null,
				targetLabel: "alpha",
				kind: "wiki",
			},
			{
				userId: "user-1",
				sourceNoteId: "note-1",
				targetNoteId: null,
				targetLabel: "idea",
				kind: "tag",
			},
			{
				userId: "user-1",
				sourceNoteId: "note-1",
				targetNoteId: null,
				targetLabel: "pinned",
				kind: "tag",
			},
		]);
	});

	test("builds person rows from inline $person chips in rich content", () => {
		const rows = buildDesiredNoteLinkRows("user-1", {
			id: "note-1",
			content: "",
			richContent: [
				{
					id: "block-1",
					type: "paragraph",
					content: [
						{ type: "text", text: "met ", styles: {} },
						{ type: "person", props: { id: "person-abc", name: "Ada" } },
						{ type: "text", text: " today", styles: {} },
					],
				},
				// biome-ignore lint/suspicious/noExplicitAny: minimal block fixture for the extractor
			] as any,
			tags: [],
		});

		expect(rows).toEqual([
			{
				userId: "user-1",
				sourceNoteId: "note-1",
				targetNoteId: null,
				targetLabel: "person-abc",
				kind: "person",
			},
		]);
	});

	test("diffs unchanged rows without write work", async () => {
		const existing = [
			row("link-1", "wiki", "alpha"),
			row("link-2", "tag", "idea"),
			row("link-3", "tag", "pinned"),
		];
		const desired: Prisma.NoteLinkCreateManyInput[] = [
			{
				userId: "user-1",
				sourceNoteId: "note-1",
				targetNoteId: null,
				targetLabel: "alpha",
				kind: "wiki",
			},
			{
				userId: "user-1",
				sourceNoteId: "note-1",
				targetNoteId: null,
				targetLabel: "idea",
				kind: "tag",
			},
			{
				userId: "user-1",
				sourceNoteId: "note-1",
				targetNoteId: null,
				targetLabel: "pinned",
				kind: "tag",
			},
		];

		expect(diffNoteLinkRows(existing, desired)).toEqual({
			removed: [],
			updated: [],
			created: [],
		});

		const { db, writes } = createDb(existing);
		await syncNoteLinks(db, "user-1", {
			id: "note-1",
			content: "[[Alpha]] #Idea",
			richContent: [],
			tags: ["Pinned"],
		});

		expect(writes).toEqual([]);
	});

	test("deletes removed rows, updates stale targets, and creates missing rows", async () => {
		const { db, rows, writes } = createDb([
			row("link-1", "wiki", "alpha"),
			row("link-2", "markdown-note-link", "beta", "old-target"),
			row("link-3", "tag", "old"),
		]);

		await syncNoteLinks(db, "user-1", {
			id: "note-1",
			content: "[[Alpha]] [Beta](note://new-target) #Fresh",
			richContent: [],
			tags: [],
		});

		expect(writes).toEqual(["deleteMany", "updateMany", "createMany"]);
		expect(rows).toEqual(
			expect.arrayContaining([
				row("link-1", "wiki", "alpha"),
				row("link-2", "markdown-note-link", "beta", "new-target"),
				expect.objectContaining({ kind: "tag", targetLabel: "fresh", targetNoteId: null }),
			]),
		);
		expect(rows).toHaveLength(3);
	});
});
