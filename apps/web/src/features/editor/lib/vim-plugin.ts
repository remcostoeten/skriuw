import { redo, undo } from "prosemirror-history";
import { Plugin, PluginKey, type Selection, TextSelection } from "prosemirror-state";
import type { Command, EditorState, Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

/**
 * Modal Vim bindings for the BlockNote (ProseMirror) editor.
 *
 * Phase 1 scope: Normal and Insert modes with the core motion and edit
 * grammar. Register the plugin on the editor's tiptap instance and gate it
 * behind a user preference — when unregistered the editor behaves normally.
 *
 * The plugin owns only modal state; every motion and edit is expressed as a
 * plain ProseMirror command so the host editor's history, schema, and
 * collaboration stay authoritative.
 */

export type VimMode = "normal" | "insert";

type VimState = {
	mode: VimMode;
	count: string;
	operator: "d" | "c" | null;
	leader: "g" | null;
};

type VimMeta = Partial<VimState>;

export const vimPluginKey = new PluginKey<VimState>("skriuw-vim");

const INITIAL_STATE: VimState = { mode: "normal", count: "", operator: null, leader: null };

export function getVimMode(state: EditorState): VimMode {
	return vimPluginKey.getState(state)?.mode ?? "normal";
}

function resolveCount(raw: string): number {
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function setMeta(view: EditorView, meta: VimMeta) {
	view.dispatch(view.state.tr.setMeta(vimPluginKey, meta));
}

function isInTextblock(selection: Selection): boolean {
	return selection.$head.parent.isTextblock;
}

function moveHorizontal(view: EditorView, amount: number): boolean {
	const { state } = view;
	const { $head } = state.selection;
	const target = clampToTextblock($head, $head.parentOffset + amount);
	if (target === null) return false;
	const pos = $head.start() + target;
	selectAt(view, pos);
	return true;
}

function clampToTextblock(
	$pos: ReturnType<EditorState["doc"]["resolve"]>,
	offset: number,
): number | null {
	const max = $pos.parent.content.size;
	const next = Math.max(0, Math.min(max, offset));
	return next;
}

function selectAt(view: EditorView, pos: number) {
	const { doc } = view.state;
	const clamped = Math.max(0, Math.min(doc.content.size, pos));
	const selection = TextSelection.near(doc.resolve(clamped));
	view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
}

function moveVertical(view: EditorView, lines: number): boolean {
	const { head } = view.state.selection;
	const coords = view.coordsAtPos(head);
	const lineHeight = coords.bottom - coords.top || 18;
	const targetY = (lines > 0 ? coords.bottom : coords.top) + lines * lineHeight;
	const found = view.posAtCoords({ left: coords.left, top: targetY });
	if (!found) return false;
	selectAt(view, found.pos);
	return true;
}

function lineStart(view: EditorView) {
	const { $head } = view.state.selection;
	selectAt(view, $head.start());
}

function lineEnd(view: EditorView) {
	const { $head } = view.state.selection;
	selectAt(view, $head.end());
}

function docStart(view: EditorView) {
	selectAt(view, 0);
}

function docEnd(view: EditorView) {
	selectAt(view, view.state.doc.content.size);
}

const WORD_BOUNDARY = /\s/;

function textOfBlock(state: EditorState): { text: string; start: number } {
	const { $head } = state.selection;
	return { text: $head.parent.textContent, start: $head.start() };
}

function nextWordOffset(text: string, from: number): number {
	let index = from;
	while (index < text.length && !WORD_BOUNDARY.test(text[index]!)) index += 1;
	while (index < text.length && WORD_BOUNDARY.test(text[index]!)) index += 1;
	return index;
}

function prevWordOffset(text: string, from: number): number {
	let index = from - 1;
	while (index > 0 && WORD_BOUNDARY.test(text[index - 1]!)) index -= 1;
	while (index > 0 && !WORD_BOUNDARY.test(text[index - 1]!)) index -= 1;
	return Math.max(0, index);
}

function endWordOffset(text: string, from: number): number {
	let index = from + 1;
	while (index < text.length && WORD_BOUNDARY.test(text[index]!)) index += 1;
	while (index < text.length && !WORD_BOUNDARY.test(text[index + 1]!)) index += 1;
	return Math.min(text.length, index);
}

function moveWord(view: EditorView, kind: "w" | "b" | "e") {
	const { text, start } = textOfBlock(view.state);
	const offset = view.state.selection.$head.parentOffset;
	const next =
		kind === "w"
			? nextWordOffset(text, offset)
			: kind === "b"
				? prevWordOffset(text, offset)
				: endWordOffset(text, offset);
	selectAt(view, start + next);
}

function deleteChar(view: EditorView) {
	const { state } = view;
	const { $head } = state.selection;
	if ($head.parentOffset >= $head.parent.content.size) return;
	const from = $head.pos;
	view.dispatch(state.tr.delete(from, from + 1).scrollIntoView());
}

function deleteLine(view: EditorView, count: number) {
	const { state } = view;
	const $head = state.selection.$head;
	const depth = $head.depth;
	let tr: Transaction = state.tr;
	const blockStart = $head.before(depth);
	let blockEnd = $head.after(depth);
	for (let line = 1; line < count; line += 1) {
		const resolved = tr.doc.resolve(Math.min(blockEnd, tr.doc.content.size));
		if (resolved.depth < depth) break;
		blockEnd = resolved.after(depth);
	}
	tr = tr.delete(blockStart, Math.min(blockEnd, tr.doc.content.size));
	view.dispatch(tr.scrollIntoView());
}

function deleteToWord(view: EditorView, enterInsert: boolean) {
	const { text, start } = textOfBlock(view.state);
	const offset = view.state.selection.$head.parentOffset;
	const end = enterInsert ? endWordOffset(text, offset - 1) : nextWordOffset(text, offset);
	const from = start + offset;
	const to = start + Math.max(offset, end);
	if (to > from) view.dispatch(view.state.tr.delete(from, to).scrollIntoView());
	if (enterInsert) setMeta(view, { mode: "insert", operator: null, count: "", leader: null });
}

function clearLineEnterInsert(view: EditorView) {
	const { $head } = view.state.selection;
	view.dispatch(view.state.tr.delete($head.start(), $head.end()));
	setMeta(view, { mode: "insert", operator: null, count: "", leader: null });
}

function openLine(view: EditorView, below: boolean) {
	const { state } = view;
	const $head = state.selection.$head;
	const pos = below ? $head.after($head.depth) : $head.before($head.depth);
	const type = $head.parent.type;
	const tr = state.tr.insert(pos, type.createAndFill()!);
	const inside = below ? pos + 1 : pos + 1;
	tr.setSelection(TextSelection.near(tr.doc.resolve(inside)));
	view.dispatch(tr.scrollIntoView());
	setMeta(view, { mode: "insert", operator: null, count: "", leader: null });
}

function runCommand(view: EditorView, command: Command): boolean {
	return command(view.state, view.dispatch, view);
}

function enterInsert(view: EditorView, place: "i" | "a" | "I" | "A") {
	if (place === "a") moveHorizontal(view, 1);
	else if (place === "I") lineStart(view);
	else if (place === "A") lineEnd(view);
	setMeta(view, { mode: "insert", operator: null, count: "", leader: null });
}

const PASSTHROUGH_KEYS = new Set([
	"ArrowUp",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	"Home",
	"End",
	"PageUp",
	"PageDown",
]);

function handleOperator(view: EditorView, op: "d" | "c", motion: string, count: number): boolean {
	if (motion === op) {
		if (op === "d") deleteLine(view, count);
		else clearLineEnterInsert(view);
		return true;
	}
	if (motion === "w") {
		deleteToWord(view, op === "c");
		return true;
	}
	return false;
}

function handleNormalKey(view: EditorView, event: KeyboardEvent): boolean {
	const vim = vimPluginKey.getState(view.state) ?? INITIAL_STATE;
	const key = event.key;

	if (PASSTHROUGH_KEYS.has(key)) return false;

	if (key === "Escape") {
		setMeta(view, { operator: null, count: "", leader: null });
		return true;
	}

	if (/^[1-9]$/.test(key) || (key === "0" && vim.count.length > 0)) {
		setMeta(view, { count: vim.count + key });
		return true;
	}

	const count = resolveCount(vim.count);

	if (vim.leader === "g") {
		setMeta(view, { leader: null, count: "" });
		if (key === "g") docStart(view);
		return true;
	}

	if (vim.operator) {
		const handled = handleOperator(view, vim.operator, key, count);
		setMeta(view, { operator: null, count: "" });
		return handled || true;
	}

	switch (key) {
		case "i":
		case "a":
		case "I":
		case "A":
			enterInsert(view, key);
			return true;
		case "o":
			openLine(view, true);
			return true;
		case "O":
			openLine(view, false);
			return true;
		case "h":
			for (let n = 0; n < count; n += 1) moveHorizontal(view, -1);
			return true;
		case "l":
			for (let n = 0; n < count; n += 1) moveHorizontal(view, 1);
			return true;
		case "j":
			for (let n = 0; n < count; n += 1) moveVertical(view, 1);
			return true;
		case "k":
			for (let n = 0; n < count; n += 1) moveVertical(view, -1);
			return true;
		case "w":
		case "b":
		case "e":
			for (let n = 0; n < count; n += 1) moveWord(view, key);
			setMeta(view, { count: "" });
			return true;
		case "0":
			lineStart(view);
			return true;
		case "$":
			lineEnd(view);
			return true;
		case "G":
			docEnd(view);
			return true;
		case "g":
			setMeta(view, { leader: "g" });
			return true;
		case "x":
			for (let n = 0; n < count; n += 1) deleteChar(view);
			setMeta(view, { count: "" });
			return true;
		case "d":
		case "c":
			setMeta(view, { operator: key });
			return true;
		case "u":
			runCommand(view, undo);
			return true;
		case "r":
			if (event.ctrlKey) {
				runCommand(view, redo);
				return true;
			}
			return true;
		default:
			return true;
	}
}

function reflectMode(view: EditorView, mode: VimMode) {
	view.dom.classList.toggle("vim-normal", mode === "normal");
	view.dom.classList.toggle("vim-insert", mode === "insert");
}

export function createVimPlugin(onModeChange?: (mode: VimMode) => void): Plugin<VimState> {
	return new Plugin<VimState>({
		key: vimPluginKey,
		state: {
			init: () => ({ ...INITIAL_STATE }),
			apply(tr, value) {
				const meta = tr.getMeta(vimPluginKey) as VimMeta | undefined;
				if (!meta) return value;
				return { ...value, ...meta };
			},
		},
		view(view) {
			reflectMode(view, getVimMode(view.state));
			onModeChange?.(getVimMode(view.state));
			let last = getVimMode(view.state);
			return {
				update(updatedView) {
					const mode = getVimMode(updatedView.state);
					if (mode !== last) {
						last = mode;
						reflectMode(updatedView, mode);
						onModeChange?.(mode);
					}
				},
			};
		},
		props: {
			handleKeyDown(view, event) {
				const vim = vimPluginKey.getState(view.state) ?? INITIAL_STATE;
				if (vim.mode === "insert") {
					if (event.key === "Escape") {
						setMeta(view, { mode: "normal", operator: null, count: "", leader: null });
						moveHorizontal(view, -1);
						return true;
					}
					return false;
				}
				if (!isInTextblock(view.state.selection)) return false;
				if (event.metaKey || (event.ctrlKey && event.key !== "r")) return false;
				return handleNormalKey(view, event);
			},
		},
	});
}
