import { describe, expect, test } from "bun:test";

import { validateUsernameFormat } from "@/lib/username";

describe("validateUsernameFormat", () => {
	test("accepts letters, numbers, underscores, and dots", () => {
		expect(validateUsernameFormat("ada_lovelace")).toBeNull();
		expect(validateUsernameFormat("user.42")).toBeNull();
		expect(validateUsernameFormat("ABC")).toBeNull();
	});

	test("rejects values that are too short", () => {
		expect(validateUsernameFormat("ab")).toBe("Username must be at least 3 characters.");
	});

	test("rejects values that are too long", () => {
		expect(validateUsernameFormat("a".repeat(31))).toBe(
			"Username must be at most 30 characters.",
		);
	});

	test("rejects disallowed characters", () => {
		expect(validateUsernameFormat("ada lovelace")).toBe(
			"Use letters, numbers, underscores, and dots only.",
		);
		expect(validateUsernameFormat("user@host")).toBe(
			"Use letters, numbers, underscores, and dots only.",
		);
	});

	test("trims surrounding whitespace before validating", () => {
		expect(validateUsernameFormat("  ada  ")).toBeNull();
	});
});
