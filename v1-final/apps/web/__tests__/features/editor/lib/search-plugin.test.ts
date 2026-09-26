import { describe, expect, test } from "bun:test";
import { buildRegex, defaultSearchOptions } from "@/features/editor/lib/search-plugin";

describe("buildRegex", () => {
	test("escapes plain search terms and applies case-insensitive matching by default", () => {
		const regex = buildRegex("hello.world", defaultSearchOptions);

		expect(regex?.source).toBe("hello\\.world");
		expect(regex?.flags).toContain("g");
		expect(regex?.flags).toContain("i");
		expect("HELLO.world".match(regex!)).toEqual(["HELLO.world"]);
	});

	test("supports whole-word and invalid regex handling", () => {
		const wholeWord = buildRegex("note", { ...defaultSearchOptions, wholeWord: true });

		expect("notebook note".match(wholeWord!)).toEqual(["note"]);
		expect(buildRegex("[", { ...defaultSearchOptions, regex: true })).toBeNull();
	});
});
