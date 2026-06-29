import { describe, expect, test } from "bun:test";
import { formatInlineTagLabel, normalizeInlineTagName } from "@/features/editor/lib/inline-tag";

describe("inline tag helpers", () => {
	test("normalizes tags before display and store selection", () => {
		expect(normalizeInlineTagName("  #Product Design  ")).toBe("product-design");
		expect(normalizeInlineTagName("###Daily---Notes")).toBe("daily-notes");
	});

	test("keeps displayed labels bounded for long inline chips", () => {
		expect(formatInlineTagLabel("a-very-long-tag-name-for-planning")).toBe(
			"#a-very-long-tag-name-for...",
		);
		expect(formatInlineTagLabel("draft")).toBe("#draft");
		expect(formatInlineTagLabel("")).toBe("#");
	});
});
