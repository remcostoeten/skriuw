import { describe, expect, test } from "bun:test";
import { parseRelativeDistanceLabel } from "@/shared/lib/parse-relative-distance-label";

describe("parseRelativeDistanceLabel", () => {
	test("parses plain minute and hour labels", () => {
		expect(parseRelativeDistanceLabel("5 minutes")).toEqual({
			kind: "numeric",
			prefix: "",
			value: 5,
			unit: "minutes",
		});
		expect(parseRelativeDistanceLabel("1 hour")).toEqual({
			kind: "numeric",
			prefix: "",
			value: 1,
			unit: "hour",
		});
	});

	test("parses fuzzy prefixes from date-fns", () => {
		expect(parseRelativeDistanceLabel("about 2 hours")).toEqual({
			kind: "numeric",
			prefix: "about ",
			value: 2,
			unit: "hours",
		});
		expect(parseRelativeDistanceLabel("almost 3 years")).toEqual({
			kind: "numeric",
			prefix: "almost ",
			value: 3,
			unit: "years",
		});
	});

	test("falls back to static text for non-numeric labels", () => {
		expect(parseRelativeDistanceLabel("less than a minute")).toEqual({
			kind: "text",
			label: "less than a minute",
		});
	});
});
