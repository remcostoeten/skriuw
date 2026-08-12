import { describe, expect, test } from "bun:test";
import { parseSearchQuery } from "@/domain/notes/search-query";

describe("parseSearchQuery", () => {
	test("passes plain text through", () => {
		expect(parseSearchQuery("oat milk")).toEqual({ text: "oat milk", tags: [], people: [] });
	});

	test("extracts tag: and # operators, normalized lowercase", () => {
		expect(parseSearchQuery("oat tag:Food #Cooking")).toEqual({
			text: "oat",
			tags: ["food", "cooking"],
			people: [],
		});
	});

	test("supports tag-only queries and dedupes", () => {
		expect(parseSearchQuery("#food tag:food")).toEqual({
			text: "",
			tags: ["food"],
			people: [],
		});
	});

	test("extracts person: and $ operators", () => {
		expect(parseSearchQuery("standup person:Ann $bob")).toEqual({
			text: "standup",
			tags: [],
			people: ["ann", "bob"],
		});
	});

	test("returns empty for blank input", () => {
		expect(parseSearchQuery("   ")).toEqual({ text: "", tags: [], people: [] });
	});
});
