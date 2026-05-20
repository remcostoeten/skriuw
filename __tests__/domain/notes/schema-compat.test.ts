import { describe, expect, test } from "bun:test";
import { isMissingNotesTagsColumnError } from "@/domain/notes/schema-compat";

describe("note schema compatibility", () => {
	test("detects a missing notes.tags column error", () => {
		expect(
			isMissingNotesTagsColumnError({
				code: "42703",
				message: "column notes.tags does not exist",
			}),
		).toBe(true);
	});

	test("ignores unrelated missing-column errors", () => {
		expect(
			isMissingNotesTagsColumnError({
				code: "42703",
				message: "column notes.rich_content does not exist",
			}),
		).toBe(false);
	});

	test("ignores non-column errors", () => {
		expect(
			isMissingNotesTagsColumnError({
				code: "23505",
				message: "duplicate key value violates unique constraint",
			}),
		).toBe(false);
	});
});
