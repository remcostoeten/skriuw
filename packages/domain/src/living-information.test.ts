import { describe, expect, test } from "bun:test";
import {
	defaultColorForKind,
	detectMarks,
	inferMarkKind,
	normalizeMark,
} from "./living-information";

describe("living information", () => {
	test("infers common mark kinds", () => {
		expect(inferMarkKind("€1,250.50")).toBe("amount");
		expect(inferMarkKind("18 September")).toBe("moment");
		expect(inferMarkKind("42")).toBe("count");
		expect(inferMarkKind("Waiting")).toBe("state");
	});

	test("uses a safe highlight color and trims label", () => {
		expect(
			normalizeMark({ text: "Launch", color: "blue", label: "  Decision  " }),
		).toMatchObject({
			color: "blue",
			label: "Decision",
		});
		expect(normalizeMark({ text: "Launch", color: "chartreuse" })).toMatchObject({
			color: "yellow",
		});
	});

	test("maps each kind to its default color", () => {
		expect(defaultColorForKind("amount")).toBe("yellow");
		expect(defaultColorForKind("count")).toBe("orange");
		expect(defaultColorForKind("moment")).toBe("blue");
		expect(defaultColorForKind("state")).toBe("green");
	});

	test("detects entities in free text without overlaps", () => {
		const marks = detectMarks(
			"The approved budget is €1,250 by 18 September, status Active with 12 interviews.",
		);
		expect(marks.map((mark) => [mark.text, mark.kind])).toEqual([
			["€1,250", "amount"],
			["18 September", "moment"],
			["Active", "state"],
			["12", "count"],
		]);
	});

	test("does not split a currency amount into a separate count", () => {
		const marks = detectMarks("Research has cost €100 so far.");
		expect(marks).toHaveLength(1);
		expect(marks[0]).toMatchObject({ text: "€100", kind: "amount" });
	});
});
