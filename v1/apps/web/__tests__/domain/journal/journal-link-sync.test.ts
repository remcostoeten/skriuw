import { describe, expect, test } from "bun:test";
import {
	backfillMissingJournalLinks,
	buildDesiredJournalLinkRows,
	buildPersonNameResolutionMap,
	type JournalLinkBackfillDb,
} from "@/domain/journal/journal-link-sync";
import type { RichTextDocument } from "@/domain/notes/models";

type CreatedRow = { sourceJournalId: string; kind: string; targetLabel: string };
type PersistedRow = CreatedRow;
type PersonRow = { id: string; name: string };

function personParagraph(id: string, name: string): RichTextDocument {
	return [
		{
			type: "paragraph",
			content: [{ type: "person", props: { id, name } }],
		},
	] as unknown as RichTextDocument;
}

function fakeBackfillDb(persisted: PersistedRow[], people: PersonRow[] = []) {
	const created: CreatedRow[] = [];
	const createdPeople: PersonRow[] = [];
	const db = {
		journalLink: {
			async findMany(args: { where: { sourceJournalId?: string } }) {
				if (args.where.sourceJournalId) {
					return persisted
						.filter((row) => row.sourceJournalId === args.where.sourceJournalId)
						.map((row, index) => ({ ...row, id: `row-${index}`, targetNoteId: null }));
				}
				return persisted;
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
		person: {
			async findMany() {
				return [...people, ...createdPeople];
			},
			async create(args: { data: { name: string } }) {
				const row = { id: `person-${createdPeople.length + 1}`, name: args.data.name };
				createdPeople.push(row);
				return row;
			},
		},
	} as unknown as JournalLinkBackfillDb;
	return { db, created, createdPeople };
}

describe("buildDesiredJournalLinkRows", () => {
	test("extracts tag rows from the tags array and person rows from rich content", () => {
		const rows = buildDesiredJournalLinkRows("user-1", {
			id: "j1",
			content: "A calm #morning entry",
			richContent: personParagraph("p1", "Ada"),
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

		expect(rows).toContainEqual(expect.objectContaining({ kind: "person", targetLabel: "p1" }));
		expect(rows).toContainEqual(expect.objectContaining({ kind: "tag", targetLabel: "plans" }));
	});

	test("resolves bare $Name mentions through the provided name map", () => {
		const rows = buildDesiredJournalLinkRows(
			"user-1",
			{
				id: "j4",
				content: "Coffee with $Ada and $Grace, spent $100",
				richContent: [],
				tags: [],
			},
			new Map([
				["ada", "p1"],
				["grace", "p2"],
			]),
		);

		const personLabels = rows
			.filter((row) => row.kind === "person")
			.map((row) => row.targetLabel)
			.sort();
		expect(personLabels).toEqual(["p1", "p2"]);
	});

	test("does not duplicate a person mentioned as both chip and bare name", () => {
		const rows = buildDesiredJournalLinkRows(
			"user-1",
			{
				id: "j5",
				content: "With $[Ada](person://p1), later $Ada again",
				richContent: [],
				tags: [],
			},
			new Map([["ada", "p1"]]),
		);

		expect(rows.filter((row) => row.kind === "person")).toHaveLength(1);
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

describe("buildPersonNameResolutionMap", () => {
	test("maps full names and unambiguous first names", () => {
		const map = buildPersonNameResolutionMap([
			{ id: "p1", name: "Ada Lovelace" },
			{ id: "p2", name: "Grace Hopper" },
			{ id: "p3", name: "Grace Kelly" },
		]);

		expect(map.get("ada lovelace")).toBe("p1");
		expect(map.get("ada")).toBe("p1");
		expect(map.get("grace hopper")).toBe("p2");
		expect(map.get("grace")).toBeUndefined();
	});
});

describe("backfillMissingJournalLinks", () => {
	const personEntry = {
		id: "j1",
		content: "Coffee with a friend",
		richContent: personParagraph("p1", "Ada"),
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

	test("skips entries whose rows are already persisted", async () => {
		const { db, created } = fakeBackfillDb([
			{ sourceJournalId: "j1", kind: "person", targetLabel: "p1" },
		]);
		const count = await backfillMissingJournalLinks(db, "user-1", [personEntry]);

		expect(count).toBe(0);
		expect(created).toEqual([]);
	});

	test("indexes bare $Name mentions, creating people that don't exist yet", async () => {
		const { db, created, createdPeople } = fakeBackfillDb([], [{ id: "p1", name: "Ada" }]);
		const count = await backfillMissingJournalLinks(db, "user-1", [
			{ id: "j6", content: "Walked with $Ada and $Grace", richContent: [], tags: [] },
		]);

		expect(count).toBe(1);
		expect(createdPeople).toEqual([expect.objectContaining({ name: "Grace" })]);
		expect(created).toContainEqual(
			expect.objectContaining({ kind: "person", targetLabel: "p1" }),
		);
		expect(created).toContainEqual(
			expect.objectContaining({ kind: "person", targetLabel: createdPeople[0]?.id }),
		);
	});
});
