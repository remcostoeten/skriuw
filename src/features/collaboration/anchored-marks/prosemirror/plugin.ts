import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";

export const anchoredMarksPluginKey = new PluginKey<DecorationSet>("anchoredMarks");

type TSetDecorationsMeta = { decorations: Decoration[] };

/**
 * Maintains the `DecorationSet` for anchored marks with a deliberate two-path
 * design for performance:
 *
 * - **Fast path** (every local transaction): the existing set is *mapped*
 *   through the change with `DecorationSet.map`. This is cheap and runs on
 *   every keystroke — no anchors are re-resolved.
 * - **Slow path** (only when the mark store changes): the engine recomputes
 *   decorations from scratch and pushes them in via plugin meta. Store changes
 *   are human-paced (adding/resolving a comment), so the O(marks) resolve never
 *   lands on the typing hot path.
 */
export function anchoredMarksPlugin(): Plugin<DecorationSet> {
	return new Plugin<DecorationSet>({
		key: anchoredMarksPluginKey,
		state: {
			init: () => DecorationSet.empty,
			apply(tr, set) {
				const meta = tr.getMeta(anchoredMarksPluginKey) as TSetDecorationsMeta | undefined;
				if (meta) return DecorationSet.create(tr.doc, meta.decorations);
				return set.map(tr.mapping, tr.doc);
			},
		},
		props: {
			decorations(state) {
				return anchoredMarksPluginKey.getState(state);
			},
		},
	});
}

/**
 * Push a freshly-computed decoration set into the editor. Called from the
 * store subscription after re-resolving anchors. A no-op-safe thin wrapper so
 * the engine never touches transaction plumbing directly.
 */
export function dispatchDecorations(view: EditorView, decorations: Decoration[]): void {
	view.dispatch(view.state.tr.setMeta(anchoredMarksPluginKey, { decorations }));
}
