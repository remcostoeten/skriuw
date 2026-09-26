export type TAnnotationTool = "pen" | "highlighter" | "eraser" | "selection";

/** The Excalidraw tool each annotation tool maps onto. */
export type TExcalidrawToolType = "freedraw" | "eraser" | "selection";

export type TAnnotationColor = {
	id: string;
	label: string;
	/** Digit that selects this color while annotating. */
	key: string;
	light: string;
	dark: string;
};

export type TAnnotationSize = {
	id: string;
	label: string;
	pen: number;
	highlighter: number;
	/** Diameter of the toolbar preview dot, in pixels. */
	dot: number;
};

export type TBrush = {
	tool: TAnnotationTool;
	colorId: string;
	sizeId: string;
};

export type TResolvedBrush = {
	excalidrawTool: TExcalidrawToolType;
	strokeColor: string;
	strokeWidth: number;
	opacity: number;
};

export const ANNOTATION_COLORS: TAnnotationColor[] = [
	{ id: "ink", label: "Ink", key: "1", light: "#1e1e1e", dark: "#e9ecef" },
	{ id: "red", label: "Red", key: "2", light: "#e03131", dark: "#ff8787" },
	{ id: "orange", label: "Orange", key: "3", light: "#e8590c", dark: "#ffa94d" },
	{ id: "yellow", label: "Yellow", key: "4", light: "#f08c00", dark: "#ffd43b" },
	{ id: "green", label: "Green", key: "5", light: "#2f9e44", dark: "#69db7c" },
	{ id: "teal", label: "Teal", key: "6", light: "#0c8599", dark: "#38d9a9" },
	{ id: "blue", label: "Blue", key: "7", light: "#1971c2", dark: "#74c0fc" },
	{ id: "violet", label: "Violet", key: "8", light: "#9c36b5", dark: "#da77f2" },
];

export const ANNOTATION_SIZES: TAnnotationSize[] = [
	{ id: "s", label: "Thin", pen: 1, highlighter: 12, dot: 4 },
	{ id: "m", label: "Medium", pen: 2, highlighter: 18, dot: 7 },
	{ id: "l", label: "Thick", pen: 4, highlighter: 28, dot: 10 },
];

export const DEFAULT_BRUSH: TBrush = { tool: "pen", colorId: "ink", sizeId: "m" };

const HIGHLIGHTER_OPACITY = 35;

export function getAnnotationColor(colorId: string): TAnnotationColor {
	return ANNOTATION_COLORS.find((color) => color.id === colorId) ?? ANNOTATION_COLORS[0];
}

export function getAnnotationSize(sizeId: string): TAnnotationSize {
	return ANNOTATION_SIZES.find((size) => size.id === sizeId) ?? ANNOTATION_SIZES[1];
}

export function resolveColorHex(colorId: string, dark: boolean): string {
	const color = getAnnotationColor(colorId);
	return dark ? color.dark : color.light;
}

export function stepSize(sizeId: string, direction: 1 | -1): string {
	const index = ANNOTATION_SIZES.findIndex((size) => size.id === sizeId);
	const next = Math.min(ANNOTATION_SIZES.length - 1, Math.max(0, index + direction));
	return ANNOTATION_SIZES[next].id;
}

/**
 * Translates a brush into the Excalidraw `appState` it implies. The highlighter
 * is not an Excalidraw tool — it is freedraw with a fat, translucent stroke.
 */
export function resolveBrush(brush: TBrush, dark: boolean): TResolvedBrush {
	const size = getAnnotationSize(brush.sizeId);
	const strokeColor = resolveColorHex(brush.colorId, dark);

	if (brush.tool === "highlighter") {
		return {
			excalidrawTool: "freedraw",
			strokeColor,
			strokeWidth: size.highlighter,
			opacity: HIGHLIGHTER_OPACITY,
		};
	}
	return {
		excalidrawTool: brush.tool === "pen" ? "freedraw" : brush.tool,
		strokeColor,
		strokeWidth: size.pen,
		opacity: 100,
	};
}
