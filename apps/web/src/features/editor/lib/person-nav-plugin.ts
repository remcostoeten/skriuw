import { NodeSelection, Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

/**
 * Routes to a person's page when Enter is pressed while the caret sits on an
 * inline `person` chip. Works with arrow-key navigation and vim block-mode
 * (jklh) movement, since both land the selection on/adjacent to the atom.
 *
 * Must be registered BEFORE BlockNote's default keymap so Enter routes instead
 * of splitting the block, and before the vim plugin so Enter-on-person wins
 * over the `Enter → j` normal-mode motion.
 */

export const personNavPluginKey = new PluginKey("person-nav");

function personIdAtSelection(view: EditorView): string | null {
	const { selection } = view.state;

	if (selection instanceof NodeSelection && selection.node.type.name === "person") {
		return String(selection.node.attrs.id ?? "") || null;
	}

	if (selection.empty) {
		const after = selection.$from.nodeAfter;
		if (after?.type.name === "person") {
			return String(after.attrs.id ?? "") || null;
		}
	}

	return null;
}

export function createPersonNavPlugin(getOnOpen: () => (id: string) => void): Plugin {
	return new Plugin({
		key: personNavPluginKey,
		props: {
			handleKeyDown(view, event) {
				if (
					event.key !== "Enter" ||
					event.shiftKey ||
					event.metaKey ||
					event.ctrlKey ||
					event.altKey
				) {
					return false;
				}
				const id = personIdAtSelection(view);
				if (!id) {
					return false;
				}
				event.preventDefault();
				getOnOpen()(id);
				return true;
			},
		},
	});
}
