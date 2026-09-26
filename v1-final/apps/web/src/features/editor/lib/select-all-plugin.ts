import { AllSelection, Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

/**
 * Two-stage Ctrl/Cmd+A. First press selects the text of the block the cursor
 * sits in; a second press while that block is fully selected expands to the
 * whole document. Registered BEFORE BlockNote's plugins so it wins over
 * ProseMirror's default `Mod-a` select-all, which jumps straight to the doc.
 */

export const selectAllPluginKey = new PluginKey("select-all");

function isSelectAll(event: KeyboardEvent): boolean {
	return (
		(event.ctrlKey || event.metaKey) &&
		!event.altKey &&
		!event.shiftKey &&
		(event.key === "a" || event.key === "A")
	);
}

function currentBlockRange(view: EditorView): { from: number; to: number } | null {
	const { $from } = view.state.selection;
	if ($from.depth === 0) {
		return null;
	}
	return { from: $from.start($from.depth), to: $from.end($from.depth) };
}

export function createSelectAllPlugin(): Plugin {
	return new Plugin({
		key: selectAllPluginKey,
		props: {
			handleKeyDown(view, event) {
				if (!isSelectAll(event)) {
					return false;
				}
				const block = currentBlockRange(view);
				if (!block) {
					return false;
				}

				const { selection, doc } = view.state;
				const alreadyBlock = selection.from === block.from && selection.to === block.to;

				event.preventDefault();
				const tr = view.state.tr.setSelection(
					alreadyBlock
						? new AllSelection(doc)
						: TextSelection.create(doc, block.from, block.to),
				);
				view.dispatch(tr.scrollIntoView());
				return true;
			},
		},
	});
}
