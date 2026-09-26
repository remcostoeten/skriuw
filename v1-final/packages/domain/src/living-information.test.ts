import { describe, expect, test } from "bun:test";
import {
	buildThreadReadings,
	defaultColorForKind,
	detectMarks,
	extractLivingMarks,
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

	test("keeps a human date with its year as one Moment", () => {
		const marks = detectMarks("The launch is 18 September 2026.");
		expect(marks).toEqual([
			expect.objectContaining({ text: "18 September 2026", kind: "moment" }),
		]);
	});

	test("extracts durable marks and groups labelled marks into live readings", () => {
		const marks = extractLivingMarks([
			{
				type: "paragraph",
				content: [
					{
						type: "mark",
						props: {
							id: "hotel",
							kind: "amount",
							text: "€840",
							value: "€840",
							thread: "Accommodation",
						},
					},
					{
						type: "mark",
						props: {
							id: "limit",
							kind: "amount",
							text: "€1,000",
							value: "€1,000",
							thread: "Accommodation",
						},
					},
				],
			},
		]);
		expect(marks).toHaveLength(2);
		const [reading] = buildThreadReadings(marks);
		expect(reading.name).toBe("Accommodation");
		expect(reading.amounts).toEqual([
			{ currency: "EUR", value: 840 },
			{ currency: "EUR", value: 1000 },
		]);
	});

	test("keeps unlabelled marks visible and derives counts and states", () => {
		const readings = buildThreadReadings([
			{ id: "count", kind: "count", text: "12", value: "12", color: "orange" },
			{ id: "state", kind: "state", text: "Active", value: "Active", color: "green" },
		]);
		expect(readings[0]).toMatchObject({
			name: "Unthreaded",
			countTotal: 12,
			states: ["Active"],
		});
	});

	test("keeps distinct thread names keyed independently and parses locale separators", () => {
		const readings = buildThreadReadings([
			{
				id: "a",
				kind: "amount",
				text: "€1.250",
				value: "€1.250",
				color: "yellow",
				thread: "Budget",
			},
			{
				id: "b",
				kind: "count",
				text: "1,5",
				value: "1,5",
				color: "orange",
				thread: "budget",
			},
		]);
		expect(readings.map((reading) => reading.id)).toEqual(["thread:Budget", "thread:budget"]);
		expect(readings[0].amounts).toEqual([{ currency: "EUR", value: 1250 }]);
		expect(readings[1].countTotal).toBe(1.5);
	});
});
