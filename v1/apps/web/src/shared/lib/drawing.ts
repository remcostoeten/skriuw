const DRAWING_FENCE_LANGUAGES = new Set(["excalidraw", "drawing"]);

export const DEFAULT_DRAWING_SCENE = "";

export type TDrawingSceneData = {
	elements: unknown[];
	appState: Record<string, unknown>;
	files: Record<string, unknown>;
};

/**
 * Parses a serialized Excalidraw scene (the `scene` prop of a `drawing`
 * block). Returns null for empty or malformed input so callers can fall back
 * to a blank canvas.
 */
export function parseDrawingScene(raw: string): TDrawingSceneData | null {
	const trimmed = raw.trim();
	if (!trimmed) {
		return null;
	}
	try {
		const parsed = JSON.parse(trimmed) as {
			elements?: unknown;
			appState?: unknown;
			files?: unknown;
		};
		if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.elements)) {
			return null;
		}
		return {
			elements: parsed.elements,
			appState:
				parsed.appState && typeof parsed.appState === "object"
					? (parsed.appState as Record<string, unknown>)
					: {},
			files:
				parsed.files && typeof parsed.files === "object"
					? (parsed.files as Record<string, unknown>)
					: {},
		};
	} catch {
		return null;
	}
}

/**
 * Normalizes a raw scene string into the canonical persisted form: a compact
 * JSON document with a stable top-level shape, or the empty default when the
 * input is blank or unparseable.
 */
export function normalizeDrawingScene(raw: string): string {
	const scene = parseDrawingScene(raw);
	if (!scene) {
		return DEFAULT_DRAWING_SCENE;
	}
	return JSON.stringify({
		type: "excalidraw",
		version: 2,
		elements: scene.elements,
		appState: scene.appState,
		files: scene.files,
	});
}

export function isDrawingFence(language: string): boolean {
	return DRAWING_FENCE_LANGUAGES.has(language.trim().toLowerCase());
}

export function countDrawingElements(raw: string): number {
	const scene = parseDrawingScene(raw);
	if (!scene) {
		return 0;
	}
	return scene.elements.filter((element) => {
		return !(element as { isDeleted?: boolean } | null)?.isDeleted;
	}).length;
}
