import { describe, expect, test } from "bun:test";
import { TOUR_STEPS } from "@/features/onboarding/tour-steps";

describe("product tour", () => {
	test("keeps first-run guidance short enough to finish", () => {
		expect(TOUR_STEPS.length).toBeLessThanOrEqual(8);
		expect(TOUR_STEPS.map(({ id }) => id)).toContain("finish");
	});
});
