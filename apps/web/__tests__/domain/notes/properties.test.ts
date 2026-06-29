import { describe, expect, test } from "bun:test";
import {
	applyNotePropertyTemplate,
	createNoteProperty,
	emptyNotePropertyValue,
	normalizeNoteProperties,
	NOTE_PROPERTY_TEMPLATES,
} from "@/domain/notes/properties";

describe("note properties", () => {
	test("normalizes untrusted persisted properties into a stable JSON shape", () => {
		const properties = normalizeNoteProperties([
			{
				id: "status",
				type: "select",
				name: " Status ",
				value: "active",
				options: [
					{ id: "active", label: " Active ", color: "green" },
					{ id: "", label: "", color: "missing" },
				],
			},
			{
				id: "",
				type: "rating",
				name: "",
				value: 8,
			},
			{ id: "bad", type: "unknown", name: "Bad", value: "x" },
		]);

		expect(properties).toEqual([
			{
				id: "status",
				type: "select",
				name: "Status",
				value: "active",
				options: [{ id: "active", label: "Active", color: "green" }],
			},
			{
				id: expect.stringMatching(/^prop_/),
				type: "rating",
				name: "Untitled",
				value: 5,
			},
		]);
	});

	test("creates empty values that match each property type", () => {
		expect(emptyNotePropertyValue("checkbox")).toBe(false);
		expect(emptyNotePropertyValue("rating")).toBeNull();
		expect(emptyNotePropertyValue("multi-select")).toEqual([]);
		expect(emptyNotePropertyValue("person")).toEqual([]);
		expect(emptyNotePropertyValue("text")).toBe("");
	});

	test("applies a template without deleting existing extra properties", () => {
		const existing = [createNoteProperty("url", "Reference")];
		const next = applyNotePropertyTemplate("project", existing);

		expect(next.map((property) => property.name)).toEqual([
			"Reference",
			"Status",
			"Priority",
			"Owner",
			"Due",
			"Tags",
			"Link",
		]);
		expect(next[0].type).toBe("url");
	});

	test("exposes starter templates from the prototype feature", () => {
		expect(NOTE_PROPERTY_TEMPLATES.map((template) => template.id)).toEqual([
			"blank",
			"meeting",
			"project",
			"person",
			"journal",
			"idea",
			"reading",
		]);
	});
});
