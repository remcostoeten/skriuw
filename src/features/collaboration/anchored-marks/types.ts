import type { Decoration } from "prosemirror-view";

/**
 * Opaque, document-relative anchor bytes. Produced and consumed ONLY by the
 * ProseMirror codec; the data store treats them as an opaque blob so the data
 * layer never imports ProseMirror. Encoded with `Y.encodeRelativePosition` so
 * the range survives concurrent edits made by other peers — store a raw offset
 * instead and the highlight slides onto the wrong words the moment someone
 * types above it.
 */
export type TAnchor = {
	start: Uint8Array;
	end: Uint8Array;
};

export type TMarkAuthor = {
	id: string;
	name: string;
	/** The author's presence color, reused from the live-cursor palette. */
	color: string;
};

/**
 * One anchored mark as it lives in the shared `Y.Map`. `type` is the
 * discriminator the renderer registry keys off — the engine itself is fully
 * payload-agnostic, which is what lets a new annotation kind (highlight,
 * suggestion, AI note…) be added without touching the store, codec or plugin.
 */
export type TAnchoredMark = {
	id: string;
	type: string;
	author: TMarkAuthor;
	anchor: TAnchor;
	/** Type-specific data (a comment thread, a suggestion diff…). */
	payload: unknown;
	createdAt: number;
	resolved: boolean;
};

/**
 * A mark whose anchor has been resolved to live absolute positions in the
 * current document. Only marks whose anchored text still exists become
 * resolved marks; a deleted range is dropped before this stage.
 */
export type TResolvedMark = {
	mark: TAnchoredMark;
	from: number;
	to: number;
};

/**
 * The adapter seam. Each annotation type contributes exactly one renderer;
 * registering it is the ONLY change needed to support a new kind. Keep
 * `buildDecorations` pure and allocation-light — it runs for every visible
 * mark on each recompute.
 */
export type TMarkRenderer = {
	type: string;
	buildDecorations(resolved: TResolvedMark): Decoration[];
};
