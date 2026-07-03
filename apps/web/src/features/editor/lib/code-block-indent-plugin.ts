import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

/**
 * Indents code blocks with four spaces on Tab.
 *
 * BlockNote ships its own code-block Tab shortcut, but it hardcodes a two-space
 * insert (`indentLineWithTab` is only an on/off toggle, not a width). This
 * plugin must be registered BEFORE BlockNote's plugins so ProseMirror consults
 * it first — otherwise the built-in two-space handler wins. It only acts inside
 * a `procode`; everywhere else Tab falls through untouched.
 */

export const codeBlockIndentPluginKey = new PluginKey("code-block-indent");

const INDENT = "    ";

function isInCodeBlock(view: EditorView): boolean {
	return view.state.selection.$from.parent.type.name === "procode";
}

export function createCodeBlockIndentPlugin(): Plugin {
	return new Plugin({
		key: codeBlockIndentPluginKey,
		props: {
			handleKeyDown(view, event) {
				if (event.key !== "Tab" || event.shiftKey || event.metaKey || event.ctrlKey) {
					return false;
				}
				if (!isInCodeBlock(view)) {
					return false;
				}
				event.preventDefault();
				view.dispatch(view.state.tr.insertText(INDENT).scrollIntoView());
				return true;
			},
		},
	});
}
