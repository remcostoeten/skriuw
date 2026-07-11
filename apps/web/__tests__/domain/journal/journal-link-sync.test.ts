import { describe, expect, test } from "bun:test";
import {
	backfillMissingJournalLinks,
	buildDesiredJournalLinkRows,
	type JournalLinkBackfillDb,
} from "@/domain/journal/journal-link-sync";

type CreatedRow = { sourceJournalId: string; kind: string; targetLabel: string };

function fakeBackfillDb(indexedIds: string[]) {
	const created: CreatedRow[] = [];
	const db = {
		journalLink: {
			async findMany(args: { distinct?: unknown }) {
				if (args.distinct) {
					return indexedIds.map((sourceJournalId) => ({ sourceJournalId }));
				}
				return [];
			},
			async deleteMany() {
				return { count: 0 };
			},
			async updateMany() {
				return { count: 0 };
			},
			async createMany(args: { data: CreatedRow[] | CreatedRow }) {
				created.push(...(Array.isArray(args.data) ? args.data : [args.data]));
				return { count: 1 };
			},
		},
	} as unknown as JournalLinkBackfillDb;
	return { db, created };
}

describe("buildDesiredJournalLinkRows", () => {
	test("extracts tag rows from the tags array and person rows from rich content", () => {
		const rows = buildDesiredJournalLinkRows("user-1", {
			id: "j1",
			content: "A calm #morning entry",
			richContent: [
				{
					type: "paragraph",
					content: [{ type: "person", props: { id: "p1", name: "Ada" } }],
				},
			],
			tags: ["gratitude"],
		});

		const byKind = (kind: string) =>
			rows
				.filter((row) => row.kind === kind)
				.map((row) => row.targetLabel)
				.sort();

		expect(rows.every((row) => row.sourceJournalId === "j1")).toBe(true);
		expect(rows.every((row) => row.userId === "user-1")).toBe(true);
		expect(byKind("tag")).toEqual(["gratitude", "morning"]);
		expect(byKind("person")).toEqual(["p1"]);
	});

	test("extracts person rows from markdown-only content (plain-text entries)", () => {
		const rows = buildDesiredJournalLinkRows("user-1", {
			id: "j3",
			content: "Lunch with $[Ada](person://p1) about #plans",
			richContent: [],
			tags: [],
		});

		expect(rows).toContainEqual(
			expect.objectContaining({ kind: "person", targetLabel: "p1" }),
		);
		expect(rows).toContainEqual(
			expect.objectContaining({ kind: "tag", targetLabel: "plans" }),
		);
	});

	test("returns no rows for an empty entry", () => {
		const rows = buildDesiredJournalLinkRows("user-1", {
			id: "j2",
			content: "",
			richContent: [],
			tags: [],
		});
		expect(rows).toEqual([]);
	});
});

describe("backfillMissingJournalLinks", () => {
	const personEntry = {
		id: "j1",
		content: "Coffee with a friend",
		richContent: [
			{
				type: "paragraph",
				content: [{ type: "person", props: { id: "p1", name: "Ada" } }],
			},
		],
		tags: [],
	};

	test("indexes entries that have no journal_links rows yet", async () => {
		const { db, created } = fakeBackfillDb([]);
		const count = await backfillMissingJournalLinks(db, "user-1", [
			personEntry,
			{ id: "j2", content: "No links here", richContent: [], tags: [] },
		]);

		expect(count).toBe(1);
		expect(created).toEqual([
			expect.objectContaining({ sourceJournalId: "j1", kind: "person", targetLabel: "p1" }),
		]);
	});

	test("skips entries that already have rows", async () => {
		const { db, created } = fakeBackfillDb(["j1"]);
		const count = await backfillMissingJournalLinks(db, "user-1", [personEntry]);

		expect(count).toBe(0);
		expect(created).toEqual([]);
	});
});
