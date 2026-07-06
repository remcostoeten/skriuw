import { describe, expect, test } from "bun:test";
import { matchesDesktopResetPhrase, RESET_PHRASE } from "@/features/settings/lib/desktop-reset";

describe("desktop reset confirmation", () => {
	test("requires the exact reset phrase ignoring case and outer whitespace", () => {
		expect(matchesDesktopResetPhrase(RESET_PHRASE)).toBe(true);
		expect(matchesDesktopResetPhrase(`  ${RESET_PHRASE.toUpperCase()}  `)).toBe(true);
		expect(matchesDesktopResetPhrase("clear my data")).toBe(false);
		expect(matchesDesktopResetPhrase("")).toBe(false);
	});
});
