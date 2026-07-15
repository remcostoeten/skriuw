import { describe, expect, test } from "bun:test";
import {
	ANNOTATION_COLORS,
	DEFAULT_BRUSH,
	resolveBrush,
	resolveColorHex,
	stepSize,
} from "@/features/editor/lib/annotation-brush";

describe("resolveBrush", () => {
	test("the pen inks opaque freedraw in the theme-appropriate hex", () => {
		const dark = resolveBrush({ tool: "pen", colorId: "red", sizeId: "m" }, true);
		const light = resolveBrush({ tool: "pen", colorId: "red", sizeId: "m" }, false);

		expect(dark.excalidrawTool).toBe("freedraw");
		expect(dark.opacity).toBe(100);
		expect(dark.strokeColor).not.toBe(light.strokeColor);
	});

	test("the highlighter is freedraw with a fat translucent stroke", () => {
		const pen = resolveBrush({ tool: "pen", colorId: "yellow", sizeId: "l" }, true);
		const highlighter = resolveBrush(
			{ tool: "highlighter", colorId: "yellow", sizeId: "l" },
			true,
		);

		expect(highlighter.excalidrawTool).toBe("freedraw");
		expect(highlighter.strokeColor).toBe(pen.strokeColor);
		expect(highlighter.opacity).toBeLessThan(pen.opacity);
		expect(highlighter.strokeWidth).toBeGreaterThan(pen.strokeWidth);
	});

	test("eraser and selection map onto themselves", () => {
		expect(resolveBrush({ ...DEFAULT_BRUSH, tool: "eraser" }, true).excalidrawTool).toBe(
			"eraser",
		);
		expect(resolveBrush({ ...DEFAULT_BRUSH, tool: "selection" }, true).excalidrawTool).toBe(
			"selection",
		);
	});

	test("an unknown color falls back to the first swatch", () => {
		expect(resolveColorHex("nope", true)).toBe(ANNOTATION_COLORS[0].dark);
	});
});

describe("stepSize", () => {
	test("steps through the sizes and clamps at both ends", () => {
		expect(stepSize("s", 1)).toBe("m");
		expect(stepSize("m", 1)).toBe("l");
		expect(stepSize("l", 1)).toBe("l");
		expect(stepSize("s", -1)).toBe("s");
	});
});

describe("color keys", () => {
	test("every swatch has a unique digit binding", () => {
		const keys = ANNOTATION_COLORS.map((color) => color.key);
		expect(new Set(keys).size).toBe(keys.length);
		expect(keys.every((key) => /^[1-9]$/.test(key))).toBe(true);
	});
});
