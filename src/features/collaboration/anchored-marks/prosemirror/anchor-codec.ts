import * as Y from "yjs";
import {
	absolutePositionToRelativePosition,
	relativePositionToAbsolutePosition,
	ySyncPluginKey,
} from "y-prosemirror";
import type { EditorView } from "prosemirror-view";
import type { TAnchor } from "../types";

// y-prosemirror keeps its position-mapping type internal; derive it from the
// helper signature so we stay correct across versions without a brittle import.
type TProsemirrorMapping = Parameters<typeof absolutePositionToRelativePosition>[2];

/**
 * Pulls the live y-prosemirror binding out of the editor state. Everything that
 * converts between ProseMirror positions and Yjs relative positions needs it;
 * it is `null` on a non-collaborative editor (no ySyncPlugin), which the codec
 * treats as "anchoring unavailable".
 */
function getBinding(view: EditorView): { type: Y.XmlFragment; mapping: TProsemirrorMapping } | null {
	const state = ySyncPluginKey.getState(view.state) as
		| { binding?: { type: Y.XmlFragment; mapping: TProsemirrorMapping } }
		| undefined;
	return state?.binding ?? null;
}

/**
 * Capture an absolute `[from, to]` range as edit-stable relative-position bytes.
 * Returns `null` when the editor isn't bound to Yjs (a solo note), so callers
 * can cheaply opt out.
 */
export function encodeAnchor(view: EditorView, from: number, to: number): TAnchor | null {
	const binding = getBinding(view);
	if (!binding) return null;
	const start = absolutePositionToRelativePosition(from, binding.type, binding.mapping);
	const end = absolutePositionToRelativePosition(to, binding.type, binding.mapping);
	return {
		start: Y.encodeRelativePosition(start),
		end: Y.encodeRelativePosition(end),
	};
}

/**
 * Resolve stored anchor bytes back to live absolute positions in the current
 * document. Returns `null` when either endpoint no longer maps — i.e. the
 * anchored text was deleted — so the caller can drop or flag the mark rather
 * than paint a stray decoration.
 */
export function resolveAnchor(
	view: EditorView,
	doc: Y.Doc,
	anchor: TAnchor,
): { from: number; to: number } | null {
	const binding = getBinding(view);
	if (!binding) return null;
	const relStart = Y.decodeRelativePosition(anchor.start);
	const relEnd = Y.decodeRelativePosition(anchor.end);
	const from = relativePositionToAbsolutePosition(doc, binding.type, relStart, binding.mapping);
	const to = relativePositionToAbsolutePosition(doc, binding.type, relEnd, binding.mapping);
	if (from == null || to == null) return null;
	return { from: Math.min(from, to), to: Math.max(from, to) };
}
