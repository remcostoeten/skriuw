import { describe, expect, test } from "bun:test";
import { buildSharePreviewDescription } from "@/domain/sharing/social-preview";

describe("buildSharePreviewDescription", () => {
	test("uses a generic message for password-protected shares", () => {
		expect(buildSharePreviewDescription("# Secret\n\nBody", true)).toBe(
			"Password-protected note shared via Skriuw.",
		);
	});

	test("strips markdown and truncates long previews", () => {
		const longBody = `# Title\n\n${"word ".repeat(80)}`;
		const preview = buildSharePreviewDescription(longBody, false);
		expect(preview.length).toBeLessThanOrEqual(160);
		expect(preview.startsWith("Title word")).toBe(true);
	});

	test("falls back when content is empty after stripping", () => {
		expect(buildSharePreviewDescription("---\n\n![](image.png)", false)).toBe(
			"Shared note via Skriuw.",
		);
	});
});
