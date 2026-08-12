export const DEFAULT_DIAGRAM_SOURCE = `flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Do the thing]
    B -->|No| D[Skip it]
    C --> E[Done]
    D --> E`;

const DIAGRAM_FENCE_LANGUAGES = new Set(["mermaid", "diagram"]);

/**
 * Returns true when a fenced code block should be treated as a diagram
 * (` ```mermaid ` and the ` ```diagram ` alias).
 */
export function isDiagramFence(language: string): boolean {
	return DIAGRAM_FENCE_LANGUAGES.has(language.trim().toLowerCase());
}

export function normalizeDiagramSource(source: string): string {
	return source.replace(/\r\n/g, "\n").trim();
}

type MermaidModule = typeof import("mermaid").default;

let mermaidPromise: Promise<MermaidModule> | null = null;

function loadMermaid(): Promise<MermaidModule> {
	if (!mermaidPromise) {
		mermaidPromise = import("mermaid").then((mod) => {
			mod.default.initialize({
				startOnLoad: false,
				securityLevel: "strict",
				theme: "dark",
				fontFamily: "inherit",
			});
			return mod.default;
		});
	}
	return mermaidPromise;
}

let renderCounter = 0;

export type DiagramRenderResult = { ok: true; svg: string } | { ok: false; error: string };

/**
 * Parses and renders Mermaid source to an SVG string. Never throws; syntax
 * errors come back as `{ ok: false, error }` so callers can show them inline.
 */
export async function renderDiagram(source: string): Promise<DiagramRenderResult> {
	const trimmed = normalizeDiagramSource(source);
	if (!trimmed) {
		return { ok: false, error: "Empty diagram" };
	}

	try {
		const mermaid = await loadMermaid();
		renderCounter += 1;
		const { svg } = await mermaid.render(`skriuw-diagram-${renderCounter}`, trimmed);
		return { ok: true, svg };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { ok: false, error: message };
	}
}
