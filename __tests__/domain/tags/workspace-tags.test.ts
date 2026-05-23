import { describe, expect, test } from "bun:test";
import { deriveWorkspaceTags } from "@/domain/tags/workspace-tags";

describe("deriveWorkspaceTags", () => {
	test("merges persisted, journal, and note tags with combined usage counts", () => {
		const tags = deriveWorkspaceTags(
			[
				{
					id: "entry-1",
					dateKey: "2026-05-23",
					content: "",
					tags: ["journal"],
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			],
			[
				{
					id: "tag-1",
					name: "shared",
					color: "hsl(var(--project-purple))",
					usageCount: 0,
				},
			],
			[
				{ tags: ["manual"], content: "#draft" },
				{ tags: [], content: "#shared #idea" },
			],
		);

		expect(tags.map((tag) => tag.name)).toEqual(["draft", "idea", "journal", "manual", "shared"]);
		expect(tags.find((tag) => tag.name === "shared")).toMatchObject({
			id: "tag-1",
			color: "hsl(var(--project-purple))",
			usageCount: 1,
		});
		expect(tags.find((tag) => tag.name === "journal")).toMatchObject({
			id: "derived-journal",
			usageCount: 1,
		});
	});
});
