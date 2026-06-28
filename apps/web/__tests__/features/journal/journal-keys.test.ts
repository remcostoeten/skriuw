import { describe, expect, test } from "bun:test";
import { journalKeys } from "@/features/journal/hooks/journal-keys";

describe("journalKeys", () => {
	test("separates local and authenticated journal entry caches", () => {
		expect(journalKeys.entries("local")).toEqual(["journal", "entries", "local"]);
		expect(journalKeys.entries("user:user-a")).toEqual(["journal", "entries", "user:user-a"]);
		expect(journalKeys.workspaceTags("user:user-a")).toEqual([
			"journal",
			"workspace-tags",
			"user:user-a",
		]);
	});

	test("keeps base keys available for prefix invalidation", () => {
		expect(journalKeys.entries()).toEqual(["journal", "entries"]);
		expect(journalKeys.tags()).toEqual(["journal", "tags"]);
		expect(journalKeys.workspaceTags()).toEqual(["journal", "workspace-tags"]);
	});
});
