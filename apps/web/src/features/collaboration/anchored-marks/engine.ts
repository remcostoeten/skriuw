import type * as Y from "yjs";
import type { EditorView } from "prosemirror-view";
import type { AnchoredMarkStore } from "./store";
import type { MarkRendererRegistry } from "./registry";
import { encodeAnchor, resolveAnchor } from "./prosemirror/anchor-codec";
import { dispatchDecorations } from "./prosemirror/plugin";
import type { TAnchoredMark, TResolvedMark } from "./types";

/** Fields a caller supplies when creating a mark; the engine fills the rest. */
export type TCreateMarkInput = {
	id: string;
	type: string;
	author: TAnchoredMark["author"];
	payload: unknown;
	createdAt: number;
};

/**
 * Ties the data store, codec and renderer registry to one live editor view.
 * Create lazily, only on collaborative notes (gate on the existing collab
 * room), and `dispose()` on unmount — it leaves behind no timers or listeners.
 *
 * The engine is intentionally the only object that knows about all three layers
 * at once; everything below it stays single-purpose and independently testable.
 */
export class AnchoredMarksEngine {
	private detach: (() => void) | null = null;
	private view: EditorView | null = null;

	constructor(
		private readonly doc: Y.Doc,
		private readonly store: AnchoredMarkStore,
		private readonly registry: MarkRendererRegistry,
	) {}

	/** Begin painting: resolve once now, then on every store change. */
	attach(view: EditorView): void {
		this.view = view;
		const recompute = () => this.recompute();
		recompute();
		this.detach = this.store.observe(recompute);
	}

	dispose(): void {
		this.detach?.();
		this.detach = null;
		this.view = null;
	}

	/**
	 * Anchor a new mark to an absolute range (typically the current selection).
	 * Returns the stored mark, or `null` when the editor isn't Yjs-bound so the
	 * caller knows anchoring was unavailable.
	 */
	create(range: { from: number; to: number }, input: TCreateMarkInput): TAnchoredMark | null {
		if (!this.view) return null;
		const anchor = encodeAnchor(this.view, range.from, range.to);
		if (!anchor) return null;
		const mark: TAnchoredMark = { ...input, anchor, resolved: false };
		this.store.add(mark);
		return mark;
	}

	private recompute(): void {
		if (!this.view) return;
		const resolved: TResolvedMark[] = [];
		for (const mark of this.store.getAll()) {
			const range = resolveAnchor(this.view, this.doc, mark.anchor);
			if (!range) continue;
			resolved.push({ mark, from: range.from, to: range.to });
		}
		dispatchDecorations(this.view, this.registry.buildAll(resolved));
	}
}
