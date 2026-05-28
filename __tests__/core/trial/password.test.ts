import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { trialPasswordForSlug } from "@/core/trial/password";
import { isTrialEmail, trialEmailForSlug } from "@/lib/trial";

describe("trial workspace", () => {
	const originalSecret = process.env.BETTER_AUTH_SECRET;

	beforeEach(() => {
		process.env.BETTER_AUTH_SECRET = "test-trial-secret";
	});

	afterEach(() => {
		process.env.BETTER_AUTH_SECRET = originalSecret;
	});

	test("trialEmailForSlug uses trial domain", () => {
		expect(trialEmailForSlug("abc-123")).toBe("trial-abc-123@trial.skriuw.local");
		expect(isTrialEmail("trial-abc-123@trial.skriuw.local")).toBe(true);
		expect(isTrialEmail("guest@demo.skriuw.local")).toBe(false);
	});

	test("trialPasswordForSlug is stable for a slug", () => {
		expect(trialPasswordForSlug("abc")).toBe(trialPasswordForSlug("abc"));
		expect(trialPasswordForSlug("abc")).not.toBe(trialPasswordForSlug("xyz"));
	});
});
