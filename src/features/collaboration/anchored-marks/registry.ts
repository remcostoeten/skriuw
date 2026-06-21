import type { Decoration } from "prosemirror-view";
import type { TMarkRenderer, TResolvedMark } from "./types";

/**
 * The adapter registry — maps a mark `type` to its renderer. This is the only
 * place that grows when a new annotation kind is added; the engine, store,
 * codec and plugin stay untouched.
 */
export class MarkRendererRegistry {
	private readonly renderers = new Map<string, TMarkRenderer>();

	constructor(renderers: TMarkRenderer[] = []) {
		for (const renderer of renderers) this.register(renderer);
	}

	register(renderer: TMarkRenderer): this {
		this.renderers.set(renderer.type, renderer);
		return this;
	}

	has(type: string): boolean {
		return this.renderers.has(type);
	}

	/**
	 * Build decorations for many resolved marks, skipping any whose type has no
	 * registered renderer. This keeps clients forward-compatible: an older build
	 * silently ignores mark types it doesn't yet know how to paint instead of
	 * throwing.
	 */
	buildAll(resolved: TResolvedMark[]): Decoration[] {
		const out: Decoration[] = [];
		for (const item of resolved) {
			const renderer = this.renderers.get(item.mark.type);
			if (!renderer) continue;
			out.push(...renderer.buildDecorations(item));
		}
		return out;
	}
}
