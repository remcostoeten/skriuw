import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

/**
 * Keyboard handling inside `procode` blocks: Tab indents with four spaces and
 * Enter inserts a literal newline instead of splitting the block.
 *
 * BlockNote ships its own code-block Tab shortcut, but it hardcodes a two-space
 * insert (`indentLineWithTab` is only an on/off toggle, not a width), and its
 * default Enter splits any inline-content block into a new paragraph. This
 * plugin must be registered BEFORE BlockNote's plugins so ProseMirror consults
 * it first — otherwise the built-in handlers win. It only acts inside a
 * `procode`; everywhere else the keys fall through untouched. Mod+Enter is left
 * alone so BlockNote's escape-the-block shortcut keeps working.
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
				if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) {
					return false;
				}
				if (event.key !== "Tab" && event.key !== "Enter") {
					return false;
				}
				if (!isInCodeBlock(view)) {
					return false;
				}
				event.preventDefault();
				const text = event.key === "Tab" ? INDENT : "\n";
				view.dispatch(view.state.tr.insertText(text).scrollIntoView());
				return true;
			},
		},
	});
}
