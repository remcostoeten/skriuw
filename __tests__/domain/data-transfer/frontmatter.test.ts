import { describe, expect, test } from "bun:test";
import {
	parseTagsField,
	parseYamlString,
	splitFrontmatter,
} from "@/domain/data-transfer/frontmatter";

describe("data transfer frontmatter", () => {
	test("splits note frontmatter from markdown body", () => {
		const raw = `---
id: 11111111-1111-4111-8111-111111111111
tags: ["idea", "draft"]
sortOrder: 2
preferredEditorMode: raw
created: 2026-05-26T10:00:00.000Z
updated: 2026-05-26T11:00:00.000Z
---

# Hello
`;
		const { frontmatter, body } = splitFrontmatter(raw);
		expect(frontmatter.id).toBe("11111111-1111-4111-8111-111111111111");
		expect(parseTagsField(frontmatter.tags)).toEqual(["idea", "draft"]);
		expect(body).toBe("\n# Hello\n");
	});

	test("parses quoted yaml strings", () => {
		expect(parseYamlString('"hello\\nworld"')).toBe("hello\nworld");
	});

	test("returns empty tags for blank tag field", () => {
		expect(parseTagsField(undefined)).toEqual([]);
		expect(parseTagsField("[]")).toEqual([]);
	});
});
