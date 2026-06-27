import * as Y from "yjs";
import type { TAnchoredMark } from "./types";

/**
 * Thin, framework-free wrapper over the shared `Y.Map` that holds anchored
 * marks. Deliberately knows nothing about ProseMirror or React — it is the
 * single source of truth for mark *data*, synced over the existing Yjs room.
 * Anchors are stored as opaque bytes (see {@link TAnchor}); turning them into
 * positions is the codec's job, keeping this layer dependency-light.
 */
export class AnchoredMarkStore {
	constructor(private readonly map: Y.Map<TAnchoredMark>) {}

	add(mark: TAnchoredMark): void {
		this.map.set(mark.id, mark);
	}

	update(id: string, patch: Partial<Omit<TAnchoredMark, "id">>): void {
		const current = this.map.get(id);
		if (!current) return;
		this.map.set(id, { ...current, ...patch });
	}

	resolve(id: string, resolved = true): void {
		this.update(id, { resolved });
	}

	remove(id: string): void {
		this.map.delete(id);
	}

	get(id: string): TAnchoredMark | undefined {
		return this.map.get(id);
	}

	getAll(): TAnchoredMark[] {
		return Array.from(this.map.values());
	}

	/** Fires on any local or remote change. Returns an unsubscribe fn. */
	observe(listener: () => void): () => void {
		this.map.observe(listener);
		return () => this.map.unobserve(listener);
	}
}

/**
 * The conventional `Y.Doc` key for the marks map, so every client agrees where
 * to look. Lives alongside — not inside — the editor's content fragment, so
 * annotations sync without ever rewriting document text.
 */
export function getAnchoredMarkMap(doc: Y.Doc, key = "anchoredMarks"): Y.Map<TAnchoredMark> {
	return doc.getMap<TAnchoredMark>(key);
}
