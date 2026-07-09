import { describe, expect, test } from "bun:test";
import { buildDesiredJournalLinkRows } from "@/domain/journal/journal-link-sync";

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
