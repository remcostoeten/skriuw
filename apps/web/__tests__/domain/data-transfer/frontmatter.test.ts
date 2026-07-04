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
		expect(frontmatter.sortOrder).toBe("2");
		expect(frontmatter.preferredEditorMode).toBe("raw");
		expect(frontmatter.created).toBe("2026-05-26T10:00:00.000Z");
		expect(frontmatter.updated).toBe("2026-05-26T11:00:00.000Z");
		expect(body).toBe("\n# Hello\n");
	});

	test("parses sortOrder zero from frontmatter", () => {
		const raw = `---
sortOrder: 0
---

Body
`;
		const { frontmatter } = splitFrontmatter(raw);
		expect(frontmatter.sortOrder).toBe("0");
	});

	test("parses quoted yaml strings with escaped backslashes", () => {
		expect(parseYamlString('"path\\\\to\\\\file"')).toBe("path\\to\\file");
	});

	test("parses quoted yaml strings", () => {
		expect(parseYamlString('"hello\\nworld"')).toBe("hello\nworld");
	});

	test("returns empty tags for blank tag field", () => {
		expect(parseTagsField(undefined)).toEqual([]);
		expect(parseTagsField("[]")).toEqual([]);
	});

	test("parses block-style (multi-line) tag lists from real vaults", () => {
		const raw = `---
title: Meeting
tags:
  - idea
  - draft
---

Body
`;
		const { frontmatter } = splitFrontmatter(raw);
		expect(frontmatter.title).toBe("Meeting");
		expect(parseTagsField(frontmatter.tags)).toEqual(["idea", "draft"]);
	});

	test("preserves multiline block-scalar values instead of truncating to one line", () => {
		const raw = `---
summary: |
  first line
  second line
---

Body
`;
		const { frontmatter } = splitFrontmatter(raw);
		expect(frontmatter.summary).toBe("first line\nsecond line\n");
	});

	test("keeps tags containing apostrophes intact", () => {
		expect(parseTagsField('["it\'s", "o\'clock"]')).toEqual(["it's", "o'clock"]);
	});

	test("parses single-quoted flow arrays", () => {
		expect(parseTagsField("['idea', 'draft']")).toEqual(["idea", "draft"]);
	});

	test("does not coerce ISO date frontmatter into Date objects", () => {
		const raw = `---
created: 2026-05-26T10:00:00.000Z
---

Body
`;
		const { frontmatter } = splitFrontmatter(raw);
		expect(frontmatter.created).toBe("2026-05-26T10:00:00.000Z");
	});
});
