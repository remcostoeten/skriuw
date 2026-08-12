import { redo, undo } from "prosemirror-history";
import { Plugin, PluginKey, type Selection, TextSelection } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import type { Command } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import { dispatchVimCommand } from "@/features/editor/lib/vim-command-bus";
import { noop } from "@/shared/lib/noop";
import {
	CHAR_SPACE,
	charClass,
	findCharOffset,
	firstNonBlankOffset,
	matchingPairOffset,
	nextWordStart,
	pairObjectBounds,
	PAIRS,
	prevWordStart,
	swapCase,
	wordEnd,
	wordObjectBounds,
} from "@/features/editor/lib/vim-text";

/**
 * Modal Vim bindings for the BlockNote (ProseMirror) editor.
 *
 * The plugin owns only modal state; every motion and edit is expressed as a
 * plain ProseMirror transaction so the host editor's history, schema, and
 * collaboration stay authoritative. The pure grammar (word/find/text-object
 * resolvers) lives in `vim-text.ts` and operates on a single block's plain
 * text — a "line" in BlockNote terms. Cross-block motions (j/k/gg/G, w/b/e at
 * block edges, and linewise operators) are handled here against the document
 * tree.
 *
 * The plugin must be registered BEFORE BlockNote's own plugins: BlockNote
 * ships an `OverrideEscape` keymap that blurs the editor on Escape, and it
 * wins if it sees the key first. Every key the plugin handles is also
 * preventDefault-ed and stopPropagation-ed so no document-level shortcut
 * (palette, pane switcher, ...) fires off a key that vim consumed.
 */

export type VimMode = "normal" | "insert" | "visual";

export type VimStatus = { mode: VimMode; command: string | null };

type VimOperator = "d" | "c" | "y";

type FindKind = "f" | "F" | "t" | "T";

type Pending =
	| { kind: "find"; find: FindKind }
	| { kind: "replace" }
	| { kind: "textobject"; around: boolean }
	| { kind: "indent"; outdent: boolean };

type LastFind = { find: FindKind; char: string };

type VimState = {
	mode: VimMode;
	linewiseVisual: boolean;
	count: string;
	/** Count typed before the operator (`2` in `2d3w`); multiplied with the motion count. */
	opCount: number;
	operator: VimOperator | null;
	leader: "g" | "z" | null;
	pending: Pending | null;
	visualAnchor: number | null;
	lastFind: LastFind | null;
	/** Ex command line: null = closed, "" = just pressed `:`, then the typed text. */
	command: string | null;
};

type VimMeta = Partial<VimState>;

type Register = { text: string; linewise: boolean };

let register: Register = { text: "", linewise: false };

/** Per-view side effects the plugin can trigger but that live outside the
 * ProseMirror layer (block nesting is a BlockNote editor API). Keyed by view so
 * split panes each dispatch to their own editor. */
type VimHandlers = { indent?: () => void; outdent?: () => void };

const viewHandlers = new WeakMap<EditorView, VimHandlers>();

export const vimPluginKey = new PluginKey<VimState>("skriuw-vim");

const INITIAL_STATE: VimState = {
	mode: "normal",
	linewiseVisual: false,
	count: "",
	opCount: 1,
	operator: null,
	leader: null,
	pending: null,
	visualAnchor: null,
	lastFind: null,
	command: null,
};

const CLEAR_TRANSIENT: VimMeta = {
	count: "",
	opCount: 1,
	operator: null,
	leader: null,
	pending: null,
};

export function getVimMode(state: EditorState): VimMode {
	return vimPluginKey.getState(state)?.mode ?? "normal";
}

function vimState(view: EditorView): VimState {
	return vimPluginKey.getState(view.state) ?? INITIAL_STATE;
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

function isPrintable(event: KeyboardEvent): boolean {
	return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

/* ------------------------------------------------------------------ *
 * `.` repeat — records the keystrokes of the last buffer-changing command
 * (plus any text typed during the insert it opened) and replays them by
 * feeding the keys back through `handleKey`. Replaying the keys — rather than
 * reconstructing each command's semantics — means every current and future
 * normal-mode edit repeats for free; only the inserted text needs capturing,
 * done with a net string diff (so a mid-insert backspace-and-retype repeats the
 * net result, not the literal keystrokes — an accepted approximation).
 * ------------------------------------------------------------------ */

type DotChange = { keys: string[]; insertText: string | null };

let lastDot: DotChange | null = null;
let dotRecording = false;
let dotKeys: string[] = [];
let dotDocBefore: EditorState["doc"] | null = null;
let dotInsertCapture: { textBefore: string; blockCount: number } | null = null;
let dotReplaying = false;

function resetDot() {
	dotRecording = false;
	dotKeys = [];
	dotDocBefore = null;
	dotInsertCapture = null;
}

function isDotInvocation(vim: VimState, key: string): boolean {
	return key === "." && !vim.operator && !vim.pending && !vim.leader;
}

/** Called before `handleKey` for every unmodified normal-mode key so the key
 * joins the in-progress change recording. */
function beforeCommandKey(view: EditorView, key: string) {
	if (dotReplaying) return;
	if (!dotRecording) {
		dotRecording = true;
		dotKeys = [];
		dotDocBefore = view.state.doc;
	}
	dotKeys.push(key);
}

/** Called after `handleKey` to decide whether the command finished, and if so
 * whether it changed the buffer (→ remember it) or merely moved/switched mode. */
function afterCommandKey(view: EditorView) {
	if (dotReplaying || !dotRecording) return;
	const vim = vimState(view);
	if (vim.operator || vim.pending || vim.leader || vim.count !== "") return;
	if (vim.mode === "insert") {
		dotInsertCapture = {
			textBefore: isInTextblock(view.state.selection) ? blockText(view.state).text : "",
			blockCount: listTextblocks(view.state).length,
		};
		dotRecording = false;
		return;
	}
	const changed = dotDocBefore !== null && view.state.doc !== dotDocBefore;
	if (changed) lastDot = { keys: [...dotKeys], insertText: null };
	resetDot();
}

/** Called from `escapeToNormal` when an insert that began as a recorded change
 * ends — captures the net inserted text and commits the change. */
function finalizeDotInsert(view: EditorView) {
	if (dotReplaying) return;
	const capture = dotInsertCapture;
	if (!capture) return;
	if (
		isInTextblock(view.state.selection) &&
		listTextblocks(view.state).length === capture.blockCount &&
		dotKeys.length > 0
	) {
		const after = blockText(view.state).text;
		lastDot = { keys: [...dotKeys], insertText: diffInsertedText(capture.textBefore, after) };
	}
	resetDot();
}

function diffInsertedText(before: string, after: string): string {
	let prefix = 0;
	const min = Math.min(before.length, after.length);
	while (prefix < min && before.charCodeAt(prefix) === after.charCodeAt(prefix)) prefix += 1;
	let suffix = 0;
	while (
		suffix < min - prefix &&
		before.charCodeAt(before.length - 1 - suffix) ===
			after.charCodeAt(after.length - 1 - suffix)
	) {
		suffix += 1;
	}
	return after.slice(prefix, after.length - suffix);
}

function insertLiteralText(view: EditorView, text: string) {
	const pos = view.state.selection.head;
	const tr = view.state.tr.insertText(text, pos);
	tr.setSelection(TextSelection.near(tr.doc.resolve(pos + text.length)));
	view.dispatch(tr);
}

/** Swap the recorded command's leading count for an explicit `3.` override. */
function withCountOverride(keys: string[], override: number | null): string[] {
	let i = 0;
	while (i < keys.length && /^[0-9]$/.test(keys[i]!)) i += 1;
	const rest = keys.slice(i);
	return override === null ? [...keys] : [...String(override).split(""), ...rest];
}

function repeatLastChange(view: EditorView, override: number | null) {
	if (!lastDot) return;
	const change = lastDot;
	dotReplaying = true;
	try {
		for (const key of withCountOverride(change.keys, override)) {
			const fake = {
				key,
				ctrlKey: false,
				metaKey: false,
				altKey: false,
				shiftKey: false,
				isComposing: false,
				preventDefault: noop,
				stopPropagation: noop,
			} as unknown as KeyboardEvent;
			handleKey(view, fake);
		}
		if (getVimMode(view.state) === "insert") {
			if (change.insertText) insertLiteralText(view, change.insertText);
			escapeToNormal(view);
		}
	} finally {
		dotReplaying = false;
	}
}

/* ------------------------------------------------------------------ *
 * Block-local text access
 * ------------------------------------------------------------------ */

function blockText(state: EditorState): {
	text: string;
	start: number;
	end: number;
	offset: number;
} {
	const { $head } = state.selection;
	return {
		text: $head.parent.textContent,
		start: $head.start(),
		end: $head.end(),
		offset: $head.parentOffset,
	};
}

/* ------------------------------------------------------------------ *
 * Cursor / selection primitives
 * ------------------------------------------------------------------ */

function selectAt(view: EditorView, pos: number) {
	const { doc } = view.state;
	const clamped = Math.max(0, Math.min(doc.content.size, pos));
	const vim = vimState(view);
	const selection =
		vim.mode === "visual" && vim.visualAnchor !== null
			? TextSelection.between(
					doc.resolve(Math.max(0, Math.min(doc.content.size, vim.visualAnchor))),
					doc.resolve(clamped),
				)
			: TextSelection.near(doc.resolve(clamped));
	view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
}

function collapseCursorAt(view: EditorView, pos: number) {
	const clamped = Math.max(0, Math.min(view.state.doc.content.size, pos));
	const selection = TextSelection.near(view.state.doc.resolve(clamped));
	view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
}

/** After a normal-mode delete, vim never leaves the cursor past the last char. */
function clampNormalCursor(view: EditorView) {
	if (getVimMode(view.state) !== "normal") return;
	if (!isInTextblock(view.state.selection)) return;
	const { text, start, offset } = blockText(view.state);
	if (text.length > 0 && offset >= text.length) {
		collapseCursorAt(view, start + text.length - 1);
	}
}

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
	const scroller = el?.closest<HTMLElement>(".bn-scroller");
	if (scroller) return scroller;
	let node = el?.parentElement ?? null;
	while (node) {
		const overflowY = getComputedStyle(node).overflowY;
		if (
			(overflowY === "auto" || overflowY === "scroll") &&
			node.scrollHeight > node.clientHeight
		) {
			return node;
		}
		node = node.parentElement;
	}
	return null;
}

/** `zz` / `zt` / `zb` — recenter, scroll-to-top, scroll-to-bottom on the caret line. */
function scrollCursorLine(view: EditorView, place: "z" | "t" | "b") {
	const head = view.state.selection.head;
	const coords = view.coordsAtPos(head);
	const scroller = findScrollParent(view.dom as HTMLElement);
	if (!scroller) {
		view.dispatch(view.state.tr.scrollIntoView());
		return;
	}
	const rect = scroller.getBoundingClientRect();
	const lineHeight = coords.bottom - coords.top || 18;
	const lineTop = coords.top - rect.top + scroller.scrollTop;
	let top: number;
	if (place === "t") top = lineTop - lineHeight * 0.5;
	else if (place === "b") top = lineTop - scroller.clientHeight + lineHeight * 1.5;
	else top = lineTop - scroller.clientHeight / 2 + lineHeight / 2;
	scroller.scrollTo({ top: Math.max(0, top) });
}

function indentBlock(view: EditorView, outdent: boolean) {
	const handlers = viewHandlers.get(view);
	const fn = outdent ? handlers?.outdent : handlers?.indent;
	fn?.();
}

function moveVertical(view: EditorView, dir: 1 | -1, count: number) {
	const left = view.coordsAtPos(view.state.selection.head).left;
	for (let n = 0; n < count; n += 1) {
		const head = view.state.selection.head;
		const coords = view.coordsAtPos(head);
		const lineHeight = coords.bottom - coords.top || 18;
		let moved = false;
		for (let step = 1; step <= 8; step += 1) {
			const delta = (lineHeight * step) / 2;
			const targetY = dir > 0 ? coords.bottom + delta : coords.top - delta;
			const found = view.posAtCoords({ left, top: targetY });
			if (found && found.pos !== head) {
				selectAt(view, found.pos);
				moved = true;
				break;
			}
		}
		if (!moved) break;
	}
}

/** Linewise up/down (`-` / `+`) — jumps whole blocks to the first non-blank
 * character, matching vim's linewise motions rather than pixel display lines. */
function moveLinewise(view: EditorView, dir: 1 | -1, count: number) {
	const blocks = listTextblocks(view.state);
	if (blocks.length === 0) return;
	const start = view.state.selection.$head.start();
	const index = blocks.findIndex((block) => block.start === start);
	if (index === -1) return;
	const target = blocks[Math.max(0, Math.min(blocks.length - 1, index + dir * count))]!;
	const offset = Math.min(firstNonBlankOffset(target.text), Math.max(0, target.text.length - 1));
	selectAt(view, target.start + offset);
}

function moveHalfPage(view: EditorView, dir: 1 | -1) {
	const coords = view.coordsAtPos(view.state.selection.head);
	const lineHeight = coords.bottom - coords.top || 18;
	const lines = Math.min(40, Math.max(1, Math.floor(window.innerHeight / 2 / lineHeight)));
	moveVertical(view, dir, lines);
}

/* ------------------------------------------------------------------ *
 * Textblock ("line") listing — gg / G / counts / cross-block motions
 * ------------------------------------------------------------------ */

type TextblockInfo = { start: number; text: string };

function listTextblocks(state: EditorState): TextblockInfo[] {
	const blocks: TextblockInfo[] = [];
	state.doc.descendants((node, pos) => {
		if (node.isTextblock) {
			blocks.push({ start: pos + 1, text: node.textContent });
			return false;
		}
		return true;
	});
	return blocks;
}

function gotoLine(view: EditorView, line: number) {
	const blocks = listTextblocks(view.state);
	if (blocks.length === 0) return;
	const target = blocks[Math.min(blocks.length, Math.max(1, line)) - 1]!;
	const offset = Math.min(firstNonBlankOffset(target.text), Math.max(0, target.text.length - 1));
	selectAt(view, target.start + offset);
}

function adjacentBlocks(state: EditorState): {
	prev: TextblockInfo | null;
	next: TextblockInfo | null;
} {
	const blocks = listTextblocks(state);
	const start = state.selection.$head.start();
	const index = blocks.findIndex((block) => block.start === start);
	if (index === -1) return { prev: null, next: null };
	return { prev: blocks[index - 1] ?? null, next: blocks[index + 1] ?? null };
}

/* ------------------------------------------------------------------ *
 * Charwise motions (within one block) — the shared grammar core
 * ------------------------------------------------------------------ */

type MotionResult = { target: number; inclusive: boolean; backward: boolean; ok: boolean };

const CHARWISE_MOTIONS = new Set([
	"h",
	"l",
	"w",
	"W",
	"b",
	"B",
	"e",
	"E",
	"0",
	"^",
	"$",
	"%",
	"f",
	"F",
	"t",
	"T",
]);

function computeMotion(
	text: string,
	offset: number,
	motion: string,
	count: number,
	char: string | null,
	repeat: boolean,
): MotionResult | null {
	const len = text.length;
	switch (motion) {
		case "h":
			return {
				target: Math.max(0, offset - count),
				inclusive: false,
				backward: true,
				ok: true,
			};
		case "l":
			return {
				target: Math.min(len, offset + count),
				inclusive: false,
				backward: false,
				ok: true,
			};
		case "w":
		case "W": {
			let t = offset;
			for (let n = 0; n < count; n += 1) t = nextWordStart(text, t, motion === "W");
			return { target: t, inclusive: false, backward: false, ok: true };
		}
		case "b":
		case "B": {
			let t = offset;
			for (let n = 0; n < count; n += 1) t = prevWordStart(text, t, motion === "B");
			return { target: t, inclusive: false, backward: true, ok: true };
		}
		case "e":
		case "E": {
			let t = offset;
			for (let n = 0; n < count; n += 1) t = wordEnd(text, t, motion === "E");
			return { target: t, inclusive: true, backward: false, ok: true };
		}
		case "0":
			return { target: 0, inclusive: false, backward: true, ok: true };
		case "^": {
			const t = firstNonBlankOffset(text);
			return { target: t, inclusive: false, backward: t < offset, ok: true };
		}
		case "$":
			return { target: len, inclusive: true, backward: false, ok: true };
		case "%": {
			const match = matchingPairOffset(text, offset);
			if (match === null)
				return { target: offset, inclusive: false, backward: false, ok: false };
			return { target: match, inclusive: true, backward: match < offset, ok: true };
		}
		case "f":
		case "F":
		case "t":
		case "T": {
			if (!char) return { target: offset, inclusive: false, backward: false, ok: false };
			const idx = findCharOffset(text, offset, motion, char, count, repeat);
			if (idx === null)
				return { target: offset, inclusive: false, backward: false, ok: false };
			const backward = motion === "F" || motion === "T";
			return { target: idx, inclusive: !backward, backward, ok: true };
		}
		default:
			return null;
	}
}

function motionCursorOffset(res: MotionResult, len: number): number {
	return Math.max(0, Math.min(len, res.target));
}

function motionVisualHead(res: MotionResult, len: number): number {
	if (res.backward) return Math.max(0, res.target);
	return Math.min(len, res.inclusive ? res.target + 1 : res.target);
}

function motionRange(
	res: MotionResult,
	start: number,
	offset: number,
	len: number,
): { from: number; to: number } {
	if (res.backward) {
		const to = start + (res.inclusive ? Math.min(len, offset + 1) : offset);
		return { from: start + res.target, to };
	}
	const to = start + Math.min(len, res.inclusive ? res.target + 1 : res.target);
	return { from: start + offset, to };
}

/* ------------------------------------------------------------------ *
 * Linewise (block) ranges
 * ------------------------------------------------------------------ */

/**
 * Depth of the node that visually IS one line. BlockNote wraps every textblock
 * as doc > blockGroup > blockContainer > paragraph, so the line unit is the
 * blockContainer (depth - 1), whose siblings inside the blockGroup are the
 * neighboring lines. In a flat schema (doc > paragraph) the textblock itself
 * is the line.
 */
type ResolvedPos = Selection["$head"];

function lineNodeDepth($pos: ResolvedPos): number {
	return Math.max(1, $pos.depth - 1);
}

function siblingBlockRange(
	state: EditorState,
	down: number,
	up: number,
): { from: number; to: number } {
	const { $head } = state.selection;
	const line = lineNodeDepth($head);
	const parentDepth = line - 1;
	const parent = $head.node(parentDepth);
	const contentStart = $head.start(parentDepth);
	const bounds: { before: number; after: number }[] = [];
	let acc = contentStart;
	parent.forEach((child) => {
		bounds.push({ before: acc, after: acc + child.nodeSize });
		acc += child.nodeSize;
	});
	const index = $head.index(parentDepth);
	const lo = Math.max(0, index - up);
	const hi = Math.min(bounds.length - 1, index + down);
	const from = bounds[lo]?.before ?? $head.before(line);
	const to = bounds[hi]?.after ?? $head.after(line);
	return { from, to: Math.min(to, state.doc.content.size) };
}

function readLinewise(view: EditorView, from: number, to: number) {
	register = { text: view.state.doc.textBetween(from, to, "\n"), linewise: true };
}

function applyLinewise(view: EditorView, op: VimOperator, from: number, to: number) {
	readLinewise(view, from, to);
	if (op === "y") {
		collapseCursorAt(view, from + 1);
		setMeta(view, CLEAR_TRANSIENT);
		return;
	}
	if (op === "c") {
		// Replace the covered lines with one fresh empty line and insert into it.
		const { $head } = view.state.selection;
		const type = $head.node(lineNodeDepth($head)).type;
		let tr = view.state.tr.delete(from, to);
		const filled = type.createAndFill();
		if (filled) {
			tr = tr.insert(from, filled);
			tr = tr.setSelection(TextSelection.near(tr.doc.resolve(from + 1)));
		}
		view.dispatch(tr.scrollIntoView());
		setMeta(view, { ...CLEAR_TRANSIENT, mode: "insert" });
		return;
	}
	view.dispatch(view.state.tr.delete(from, to).scrollIntoView());
	setMeta(view, CLEAR_TRANSIENT);
	clampNormalCursor(view);
}

/* ------------------------------------------------------------------ *
 * Charwise operator application
 * ------------------------------------------------------------------ */

function applyCharwise(view: EditorView, op: VimOperator, from: number, to: number) {
	if (to <= from) {
		setMeta(view, CLEAR_TRANSIENT);
		return;
	}
	register = { text: view.state.doc.textBetween(from, to, ""), linewise: false };
	if (op === "y") {
		collapseCursorAt(view, from);
		setMeta(view, CLEAR_TRANSIENT);
		return;
	}
	view.dispatch(view.state.tr.delete(from, to).scrollIntoView());
	setMeta(view, op === "c" ? { ...CLEAR_TRANSIENT, mode: "insert" } : CLEAR_TRANSIENT);
	if (op === "d") clampNormalCursor(view);
}

function applyMotionOperator(view: EditorView, op: VimOperator, res: MotionResult | null) {
	if (!res || !res.ok) {
		setMeta(view, CLEAR_TRANSIENT);
		return;
	}
	const { text, start, offset } = blockText(view.state);
	const { from, to } = motionRange(res, start, offset, text.length);
	applyCharwise(view, op, from, to);
}

/* ------------------------------------------------------------------ *
 * Edits
 * ------------------------------------------------------------------ */

function deleteChars(view: EditorView, count: number, before: boolean) {
	const { text, start, offset } = blockText(view.state);
	const from = before ? start + Math.max(0, offset - count) : start + offset;
	const to = before ? start + offset : start + Math.min(text.length, offset + count);
	if (to <= from) return;
	register = { text: view.state.doc.textBetween(from, to, ""), linewise: false };
	view.dispatch(view.state.tr.delete(from, to).scrollIntoView());
	clampNormalCursor(view);
}

function replaceChars(view: EditorView, ch: string, count: number) {
	const { text, start, offset } = blockText(view.state);
	if (offset + count > text.length) return;
	const from = start + offset;
	const to = from + count;
	const tr = view.state.tr.insertText(ch.repeat(count), from, to);
	tr.setSelection(TextSelection.near(tr.doc.resolve(from + count - 1)));
	view.dispatch(tr.scrollIntoView());
}

function toggleCase(view: EditorView, count: number) {
	const { text, start, offset } = blockText(view.state);
	const end = Math.min(text.length, offset + count);
	if (end <= offset) return;
	const swapped = swapCase(text.slice(offset, end));
	const from = start + offset;
	const tr = view.state.tr.insertText(swapped, from, start + end);
	tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(start + end, start + text.length))));
	view.dispatch(tr.scrollIntoView());
	clampNormalCursor(view);
}

function joinLines(view: EditorView, count: number) {
	const joins = count > 1 ? count - 1 : 1;
	let tr: Transaction = view.state.tr;
	for (let j = 0; j < joins; j += 1) {
		const $head = tr.selection.$head;
		const from = $head.end();
		// Deleting from the end of this textblock to the start of the next one
		// removes the structural boundary between them (blockContainer walls
		// included), which merges the two lines — tr.join can't cross them.
		let nextStart = -1;
		tr.doc.descendants((node, pos) => {
			if (nextStart !== -1) return false;
			if (node.isTextblock && pos + 1 > from) {
				nextStart = pos + 1;
				return false;
			}
			return true;
		});
		if (nextStart === -1) break;
		const hadText = from > $head.start();
		tr = tr.delete(from, nextStart);
		if (hadText) tr = tr.insertText(" ", from);
		tr = tr.setSelection(TextSelection.near(tr.doc.resolve(from)));
	}
	view.dispatch(tr.scrollIntoView());
}

function openLine(view: EditorView, below: boolean) {
	const { state } = view;
	const $head = state.selection.$head;
	const line = lineNodeDepth($head);
	const pos = below ? $head.after(line) : $head.before(line);
	const filled = $head.node(line).type.createAndFill();
	if (!filled) return;
	const tr = state.tr.insert(pos, filled);
	tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
	view.dispatch(tr.scrollIntoView());
	setMeta(view, { ...CLEAR_TRANSIENT, mode: "insert" });
}

function enterInsert(view: EditorView, place: "i" | "a" | "I" | "A") {
	const { text, start, offset } = blockText(view.state);
	if (place === "a") collapseCursorAt(view, start + Math.min(text.length, offset + 1));
	else if (place === "I") collapseCursorAt(view, start + firstNonBlankOffset(text));
	else if (place === "A") collapseCursorAt(view, start + text.length);
	setMeta(view, { ...CLEAR_TRANSIENT, mode: "insert" });
}

/* ------------------------------------------------------------------ *
 * Paste
 * ------------------------------------------------------------------ */

function pasteCharwise(view: EditorView, after: boolean) {
	if (!register.text) return;
	const { $head } = view.state.selection;
	const atLineEnd = $head.parentOffset >= $head.parent.content.size;
	const insertPos = after && !atLineEnd ? $head.pos + 1 : $head.pos;
	const tr = view.state.tr.insertText(register.text, insertPos);
	const cursor = Math.max(insertPos, insertPos + register.text.length - 1);
	tr.setSelection(TextSelection.near(tr.doc.resolve(cursor)));
	view.dispatch(tr.scrollIntoView());
}

function pasteLinewise(view: EditorView, below: boolean) {
	if (!register.text) return;
	const { state } = view;
	const $head = state.selection.$head;
	const line = lineNodeDepth($head);
	const lineType = $head.node(line).type;
	const parentType = $head.parent.type;
	const textType = parentType.isTextblock ? parentType : state.schema.nodes.paragraph!;
	const nodes = register.text
		.split("\n")
		.map((lineText) => {
			const textblock = textType.createAndFill(
				$head.parent.attrs,
				lineText ? state.schema.text(lineText) : undefined,
			);
			if (!textblock) return null;
			// In BlockNote every line lives in its own blockContainer; a bare
			// textblock sibling would be rejected by the schema.
			return line === $head.depth ? textblock : lineType.createAndFill(null, textblock);
		})
		.filter((node): node is NonNullable<typeof node> => node !== null);
	if (nodes.length === 0) return;
	const pos = below ? $head.after(line) : $head.before(line);
	const tr = state.tr.insert(pos, nodes);
	tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
	view.dispatch(tr.scrollIntoView());
}

function paste(view: EditorView, after: boolean) {
	if (register.linewise) pasteLinewise(view, after);
	else pasteCharwise(view, after);
}

/** Visual-mode `p`: replace the selection with the register; the replaced text
 * takes its place in the register, matching vim's register swap. */
function pasteOverSelection(view: EditorView) {
	const saved: Register = { ...register };
	if (!saved.text) {
		visualToNormal(view);
		return;
	}
	deleteSelection(view, false);
	const deleted: Register = { ...register };
	register = saved;
	if (saved.linewise) {
		pasteLinewise(view, false);
	} else {
		const pos = view.state.selection.head;
		const tr = view.state.tr.insertText(saved.text, pos);
		tr.setSelection(TextSelection.near(tr.doc.resolve(pos + saved.text.length - 1)));
		view.dispatch(tr.scrollIntoView());
	}
	register = deleted;
}

/* ------------------------------------------------------------------ *
 * Text objects
 * ------------------------------------------------------------------ */

function textObjectRange(
	state: EditorState,
	objChar: string,
	around: boolean,
): { from: number; to: number } | null {
	const { text, start, offset } = blockText(state);
	if (objChar === "w" || objChar === "W") {
		const { s, e } = wordObjectBounds(text, offset, around);
		return { from: start + s, to: start + e };
	}
	const pair = PAIRS[objChar];
	if (pair) {
		const bounds = pairObjectBounds(text, offset, pair.open, pair.close, around);
		if (!bounds) return null;
		return { from: start + bounds.s, to: start + bounds.e };
	}
	return null;
}

/* ------------------------------------------------------------------ *
 * Mode transitions
 * ------------------------------------------------------------------ */

function escapeToNormal(view: EditorView) {
	finalizeDotInsert(view);
	setMeta(view, {
		...CLEAR_TRANSIENT,
		mode: "normal",
		visualAnchor: null,
		linewiseVisual: false,
	});
	if (!isInTextblock(view.state.selection)) return;
	const { text, start, offset } = blockText(view.state);
	collapseCursorAt(view, start + Math.max(0, Math.min(text.length - 1, offset - 1)));
}

function enterVisual(view: EditorView, linewise: boolean) {
	setMeta(view, {
		...CLEAR_TRANSIENT,
		mode: "visual",
		linewiseVisual: linewise,
		visualAnchor: view.state.selection.head,
	});
}

function visualToNormal(view: EditorView) {
	const head = view.state.selection.head;
	setMeta(view, {
		...CLEAR_TRANSIENT,
		mode: "normal",
		visualAnchor: null,
		linewiseVisual: false,
	});
	collapseCursorAt(view, head);
}

function visualToInsert(view: EditorView) {
	const head = view.state.selection.head;
	setMeta(view, {
		...CLEAR_TRANSIENT,
		mode: "insert",
		visualAnchor: null,
		linewiseVisual: false,
	});
	collapseCursorAt(view, head);
}

function cycleMode(view: EditorView) {
	const mode = getVimMode(view.state);
	if (mode === "insert") escapeToNormal(view);
	else if (mode === "normal") enterVisual(view, false);
	else visualToInsert(view);
}

function runCommand(view: EditorView, command: Command): boolean {
	return command(view.state, view.dispatch, view);
}

/* ------------------------------------------------------------------ *
 * Visual-mode operators
 * ------------------------------------------------------------------ */

function visualBounds(view: EditorView): { from: number; to: number } {
	const vim = vimState(view);
	const { from, to } = view.state.selection;
	if (!vim.linewiseVisual) return { from, to };
	const $from = view.state.doc.resolve(from);
	const $to = view.state.doc.resolve(to);
	const start = $from.before($from.depth);
	const end = $to.after($to.depth);
	return { from: start, to: Math.min(end, view.state.doc.content.size) };
}

function yankSelection(view: EditorView) {
	const vim = vimState(view);
	const { from, to } = visualBounds(view);
	register = { text: view.state.doc.textBetween(from, to, "\n"), linewise: vim.linewiseVisual };
	setMeta(view, {
		...CLEAR_TRANSIENT,
		mode: "normal",
		visualAnchor: null,
		linewiseVisual: false,
	});
	collapseCursorAt(view, from);
}

function deleteSelection(view: EditorView, thenInsert: boolean) {
	const vim = vimState(view);
	const { from, to } = visualBounds(view);
	if (to <= from) {
		if (thenInsert) visualToInsert(view);
		else visualToNormal(view);
		return;
	}
	register = { text: view.state.doc.textBetween(from, to, "\n"), linewise: vim.linewiseVisual };
	view.dispatch(view.state.tr.delete(from, to).scrollIntoView());
	setMeta(view, {
		...CLEAR_TRANSIENT,
		mode: thenInsert ? "insert" : "normal",
		visualAnchor: null,
		linewiseVisual: false,
	});
	if (!thenInsert) clampNormalCursor(view);
}

function recaseSelection(view: EditorView, transform: (text: string) => string) {
	const { from, to } = view.state.selection;
	if (to <= from) return;
	const next = transform(view.state.doc.textBetween(from, to, "\n"));
	const tr = view.state.tr.insertText(next, from, to);
	view.dispatch(tr.scrollIntoView());
	setMeta(view, {
		...CLEAR_TRANSIENT,
		mode: "normal",
		visualAnchor: null,
		linewiseVisual: false,
	});
	collapseCursorAt(view, from);
}

function swapVisualEnds(view: EditorView) {
	const { anchor, head } = view.state.selection;
	setMeta(view, { visualAnchor: head });
	selectAt(view, anchor);
}

/* ------------------------------------------------------------------ *
 * Pending-key resolution (find / replace / text object)
 * ------------------------------------------------------------------ */

function reverseFind(find: FindKind): FindKind {
	if (find === "f") return "F";
	if (find === "F") return "f";
	if (find === "t") return "T";
	return "t";
}

function applyMotionMove(view: EditorView, res: MotionResult | null) {
	if (!res || !res.ok) {
		setMeta(view, CLEAR_TRANSIENT);
		return;
	}
	const { text, start } = blockText(view.state);
	const vim = vimState(view);
	const offset =
		vim.mode === "visual"
			? motionVisualHead(res, text.length)
			: Math.min(motionCursorOffset(res, text.length), Math.max(0, text.length - 1));
	selectAt(view, start + offset);
	setMeta(view, CLEAR_TRANSIENT);
}

/**
 * Real vim word motions flow across lines. When a block-local w/b/e cannot
 * advance any further, the motion hops to the adjacent block. Counts resolve
 * block-locally first, so `5w` near a block edge lands on the next block's
 * first word rather than five words in — an accepted approximation.
 */
function crossBlockTarget(
	state: EditorState,
	motion: string,
	res: MotionResult,
	text: string,
	offset: number,
	visual: boolean,
): number | null {
	if (motion === "w" || motion === "W") {
		if (res.target < text.length) return null;
		const { next } = adjacentBlocks(state);
		if (!next) return null;
		const t = Math.min(
			firstNonBlankOffset(next.text),
			Math.max(0, next.text.length - (visual ? 0 : 1)),
		);
		return next.start + t;
	}
	if (motion === "b" || motion === "B") {
		const stuck =
			offset === 0 || (res.target === 0 && charClass(text[0], motion === "B") === CHAR_SPACE);
		if (!stuck) return null;
		const { prev } = adjacentBlocks(state);
		if (!prev) return null;
		return prev.start + prevWordStart(prev.text, prev.text.length, motion === "B");
	}
	if (motion === "e" || motion === "E") {
		if (res.target > offset) return null;
		const { next } = adjacentBlocks(state);
		if (!next) return null;
		const t = Math.max(0, wordEnd(next.text, -1, motion === "E"));
		return next.start + t + (visual ? 1 : 0);
	}
	return null;
}

function runMotion(
	view: EditorView,
	motion: string,
	count: number,
	char: string | null,
	repeat: boolean,
) {
	const vim = vimState(view);
	const { text, offset } = blockText(view.state);
	const res = computeMotion(text, offset, motion, count, char, repeat);
	if (vim.operator) {
		applyMotionOperator(view, vim.operator, res);
		return;
	}
	if (res?.ok) {
		const cross = crossBlockTarget(
			view.state,
			motion,
			res,
			text,
			offset,
			vim.mode === "visual",
		);
		if (cross !== null) {
			selectAt(view, cross);
			setMeta(view, CLEAR_TRANSIENT);
			return;
		}
	}
	applyMotionMove(view, res);
}

function resolveFind(view: EditorView, find: FindKind, char: string, count: number) {
	setMeta(view, { lastFind: { find, char } });
	runMotion(view, find, count, char, false);
}

function resolveTextObject(view: EditorView, objChar: string, around: boolean) {
	const vim = vimState(view);
	const range = textObjectRange(view.state, objChar, around);
	if (!range) {
		setMeta(view, CLEAR_TRANSIENT);
		return;
	}
	if (vim.mode === "visual") {
		const selection = TextSelection.create(view.state.doc, range.from, range.to);
		view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
		setMeta(view, { visualAnchor: range.from, pending: null, count: "" });
		return;
	}
	if (vim.operator) applyCharwise(view, vim.operator, range.from, range.to);
	else setMeta(view, CLEAR_TRANSIENT);
}

/* ------------------------------------------------------------------ *
 * Operator dispatch (second key after d/c/y)
 * ------------------------------------------------------------------ */

function operatorLinewise(view: EditorView, op: VimOperator, down: number, up: number) {
	const { from, to } = siblingBlockRange(view.state, down, up);
	applyLinewise(view, op, from, to);
}

function handleOperatorKey(
	view: EditorView,
	op: VimOperator,
	key: string,
	count: number,
	event: KeyboardEvent,
): boolean {
	if (key === op) {
		operatorLinewise(view, op, count - 1, 0);
		return true;
	}
	if (key === "j") {
		operatorLinewise(view, op, count, 0);
		return true;
	}
	if (key === "k") {
		operatorLinewise(view, op, 0, count);
		return true;
	}
	if (key === "G") {
		const $head = view.state.selection.$head;
		const from = $head.before(lineNodeDepth($head));
		applyLinewise(view, op, from, view.state.doc.content.size);
		return true;
	}
	if (key === "g") {
		setMeta(view, { leader: "g" });
		return true;
	}
	if (key === "i" || key === "a") {
		setMeta(view, { pending: { kind: "textobject", around: key === "a" } });
		return true;
	}
	if (key === "f" || key === "F" || key === "t" || key === "T") {
		setMeta(view, { pending: { kind: "find", find: key } });
		return true;
	}
	if (key === ";" || key === ",") {
		const vim = vimState(view);
		if (!vim.lastFind) {
			setMeta(view, CLEAR_TRANSIENT);
			return true;
		}
		const find = key === ";" ? vim.lastFind.find : reverseFind(vim.lastFind.find);
		runMotion(view, find, count, vim.lastFind.char, true);
		return true;
	}
	// vim special case: `cw`/`cW` on a non-blank char behaves like `ce`/`cE`,
	// leaving the whitespace after the word intact.
	if (op === "c" && (key === "w" || key === "W")) {
		const { text, offset } = blockText(view.state);
		if (charClass(text[offset], key === "W") !== CHAR_SPACE) {
			runMotion(view, key === "w" ? "e" : "E", count, null, false);
			return true;
		}
	}
	if (CHARWISE_MOTIONS.has(key)) {
		if (!isPrintable(event) && key.length !== 1) {
			setMeta(view, CLEAR_TRANSIENT);
			return true;
		}
		runMotion(view, key, count, null, false);
		return true;
	}
	setMeta(view, CLEAR_TRANSIENT);
	return isPrintable(event) || key.length === 1;
}

function handleLeaderZ(view: EditorView, key: string): boolean {
	if (key === "z" || key === "t" || key === "b") scrollCursorLine(view, key);
	setMeta(view, CLEAR_TRANSIENT);
	return true;
}

function handleLeaderG(view: EditorView, key: string, count: number): boolean {
	const vim = vimState(view);
	if (key === "g") {
		if (vim.operator) {
			const $head = view.state.selection.$head;
			const to = $head.after(lineNodeDepth($head));
			applyLinewise(view, vim.operator, 0, to);
			return true;
		}
		gotoLine(view, count);
		setMeta(view, CLEAR_TRANSIENT);
		return true;
	}
	setMeta(view, CLEAR_TRANSIENT);
	return true;
}

/* ------------------------------------------------------------------ *
 * Base key handlers
 * ------------------------------------------------------------------ */

function handleNormalBase(
	view: EditorView,
	key: string,
	count: number,
	event: KeyboardEvent,
): boolean {
	if (event.ctrlKey) {
		if (key === "d") {
			moveHalfPage(view, 1);
			setMeta(view, { count: "" });
			return true;
		}
		if (key === "u") {
			moveHalfPage(view, -1);
			setMeta(view, { count: "" });
			return true;
		}
		if (key === "r") {
			runCommand(view, redo);
			setMeta(view, { count: "" });
			return true;
		}
		return false;
	}

	if (CHARWISE_MOTIONS.has(key)) {
		if (key === "f" || key === "F" || key === "t" || key === "T") {
			setMeta(view, { pending: { kind: "find", find: key } });
			return true;
		}
		runMotion(view, key, count, null, false);
		return true;
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
		case "v":
			enterVisual(view, false);
			return true;
		case "V":
			enterVisual(view, true);
			return true;
		case "j":
			moveVertical(view, 1, count);
			setMeta(view, { count: "" });
			return true;
		case "k":
			moveVertical(view, -1, count);
			setMeta(view, { count: "" });
			return true;
		case "+":
			moveLinewise(view, 1, count);
			setMeta(view, { count: "" });
			return true;
		case "-":
			moveLinewise(view, -1, count);
			setMeta(view, { count: "" });
			return true;
		case "G":
			gotoLine(view, vimState(view).count.length > 0 ? count : Number.MAX_SAFE_INTEGER);
			setMeta(view, { count: "" });
			return true;
		case "g":
			setMeta(view, { leader: "g" });
			return true;
		case "z":
			setMeta(view, { leader: "z" });
			return true;
		case ".": {
			const override = vimState(view).count.length > 0 ? count : null;
			setMeta(view, { count: "" });
			repeatLastChange(view, override);
			return true;
		}
		case ">":
			setMeta(view, { pending: { kind: "indent", outdent: false } });
			return true;
		case "<":
			setMeta(view, { pending: { kind: "indent", outdent: true } });
			return true;
		case ";":
		case ",": {
			const vim = vimState(view);
			if (!vim.lastFind) return true;
			const find = key === ";" ? vim.lastFind.find : reverseFind(vim.lastFind.find);
			runMotion(view, find, count, vim.lastFind.char, true);
			return true;
		}
		case "x":
			deleteChars(view, count, false);
			setMeta(view, { count: "" });
			return true;
		case "X":
			deleteChars(view, count, true);
			setMeta(view, { count: "" });
			return true;
		case "r":
			setMeta(view, { pending: { kind: "replace" } });
			return true;
		case "~":
			toggleCase(view, count);
			setMeta(view, { count: "" });
			return true;
		case "J":
			joinLines(view, count);
			setMeta(view, { count: "" });
			return true;
		case "D": {
			const { start, end, offset } = blockText(view.state);
			applyCharwise(view, "d", start + offset, end);
			return true;
		}
		case "C": {
			const { start, end, offset } = blockText(view.state);
			applyCharwise(view, "c", start + offset, end);
			return true;
		}
		case "S":
			operatorLinewise(view, "c", count - 1, 0);
			return true;
		case "s": {
			const { text, start, offset } = blockText(view.state);
			applyCharwise(view, "c", start + offset, start + Math.min(text.length, offset + count));
			return true;
		}
		case ":":
			setMeta(view, { ...CLEAR_TRANSIENT, command: "" });
			return true;
		case "d":
		case "c":
		case "y":
			setMeta(view, {
				operator: key,
				opCount: resolveCount(vimState(view).count),
				count: "",
			});
			return true;
		case "Y":
			operatorLinewise(view, "y", count - 1, 0);
			return true;
		case "p":
			paste(view, true);
			setMeta(view, { count: "" });
			return true;
		case "P":
			paste(view, false);
			setMeta(view, { count: "" });
			return true;
		case "u":
			runCommand(view, undo);
			setMeta(view, { count: "" });
			return true;
		default:
			return isPrintable(event);
	}
}

function handleVisualBase(
	view: EditorView,
	key: string,
	count: number,
	event: KeyboardEvent,
): boolean {
	if (event.ctrlKey) {
		if (key === "d") {
			moveHalfPage(view, 1);
			setMeta(view, { count: "" });
			return true;
		}
		if (key === "u") {
			moveHalfPage(view, -1);
			setMeta(view, { count: "" });
			return true;
		}
		return false;
	}

	if (CHARWISE_MOTIONS.has(key)) {
		if (key === "f" || key === "F" || key === "t" || key === "T") {
			setMeta(view, { pending: { kind: "find", find: key } });
			return true;
		}
		runMotion(view, key, count, null, false);
		return true;
	}

	switch (key) {
		case "j":
			moveVertical(view, 1, count);
			setMeta(view, { count: "" });
			return true;
		case "k":
			moveVertical(view, -1, count);
			setMeta(view, { count: "" });
			return true;
		case "+":
			moveLinewise(view, 1, count);
			setMeta(view, { count: "" });
			return true;
		case "-":
			moveLinewise(view, -1, count);
			setMeta(view, { count: "" });
			return true;
		case "G":
			gotoLine(view, vimState(view).count.length > 0 ? count : Number.MAX_SAFE_INTEGER);
			setMeta(view, { count: "" });
			return true;
		case "g":
			setMeta(view, { leader: "g" });
			return true;
		case ";":
		case ",": {
			const vim = vimState(view);
			if (!vim.lastFind) return true;
			const find = key === ";" ? vim.lastFind.find : reverseFind(vim.lastFind.find);
			runMotion(view, find, count, vim.lastFind.char, true);
			return true;
		}
		case "i":
		case "a":
			setMeta(view, { pending: { kind: "textobject", around: key === "a" } });
			return true;
		case "o":
			swapVisualEnds(view);
			return true;
		case "V":
			setMeta(view, { linewiseVisual: !vimState(view).linewiseVisual });
			return true;
		case "y":
			yankSelection(view);
			return true;
		case "d":
		case "x":
			deleteSelection(view, false);
			return true;
		case "c":
		case "s":
			deleteSelection(view, true);
			return true;
		case "p":
		case "P":
			pasteOverSelection(view);
			return true;
		case ":":
			setMeta(view, { ...CLEAR_TRANSIENT, command: "" });
			return true;
		case "r":
			setMeta(view, { pending: { kind: "replace" } });
			return true;
		case "~":
			recaseSelection(view, swapCase);
			return true;
		case "u":
			recaseSelection(view, (t) => t.toLowerCase());
			return true;
		case "U":
			recaseSelection(view, (t) => t.toUpperCase());
			return true;
		default:
			return isPrintable(event);
	}
}

/* ------------------------------------------------------------------ *
 * Top-level key routing
 * ------------------------------------------------------------------ */

/** Editing-key equivalents, resolved after pending keys (a literal `f<space>`
 * must stay a space) so arrows and friends behave like their vim motions. */
const KEY_ALIASES: Record<string, string> = {
	ArrowLeft: "h",
	ArrowRight: "l",
	ArrowUp: "k",
	ArrowDown: "j",
	Home: "0",
	End: "$",
	Backspace: "h",
	" ": "l",
	Enter: "j",
	Delete: "x",
};

const PASSTHROUGH_KEYS = new Set(["PageUp", "PageDown", "Tab"]);

const EX_COMMANDS = new Set(["w", "w!", "q", "q!", "wq", "wq!", "x", "x!"]);

function executeExCommand(view: EditorView, raw: string) {
	const command = raw.trim();
	setMeta(view, {
		...CLEAR_TRANSIENT,
		command: null,
		mode: "normal",
		visualAnchor: null,
		linewiseVisual: false,
	});
	if (!command) return;
	if (/^\d+$/.test(command)) {
		gotoLine(view, Number.parseInt(command, 10));
		return;
	}
	if (command === "$") {
		gotoLine(view, Number.MAX_SAFE_INTEGER);
		return;
	}
	// Save/quit leaves the editor's world: the host app (use-notes-layout)
	// listens on the window bus and maps :w → flush, :q → close tab/split.
	if (EX_COMMANDS.has(command)) {
		dispatchVimCommand(command);
	}
}

function handleCommandLineKey(view: EditorView, command: string, event: KeyboardEvent): boolean {
	const raw = event.key;
	if (raw === "Escape") {
		setMeta(view, { command: null });
		return true;
	}
	if (raw === "Enter") {
		executeExCommand(view, command);
		return true;
	}
	if (raw === "Backspace") {
		setMeta(view, { command: command.length > 0 ? command.slice(0, -1) : null });
		return true;
	}
	if (isPrintable(event)) {
		setMeta(view, { command: command + raw });
		return true;
	}
	return true;
}

function handleKey(view: EditorView, event: KeyboardEvent): boolean {
	const vim = vimState(view);
	const raw = event.key;

	if (vim.command !== null) {
		return handleCommandLineKey(view, vim.command, event);
	}

	if (raw === "Escape") {
		if (vim.pending || vim.operator || vim.leader || vim.count) {
			setMeta(view, CLEAR_TRANSIENT);
			return true;
		}
		if (vim.mode === "visual") visualToNormal(view);
		return true;
	}

	if (!vim.pending && (/^[1-9]$/.test(raw) || (raw === "0" && vim.count.length > 0))) {
		setMeta(view, { count: vim.count + raw });
		return true;
	}

	const count = resolveCount(vim.count) * (vim.operator ? vim.opCount : 1);

	if (vim.pending?.kind === "find") {
		if (!isPrintable(event)) {
			setMeta(view, CLEAR_TRANSIENT);
			return true;
		}
		resolveFind(view, vim.pending.find, raw, count);
		return true;
	}

	if (vim.pending?.kind === "replace") {
		if (!isPrintable(event)) {
			setMeta(view, CLEAR_TRANSIENT);
			return true;
		}
		if (vim.mode === "visual") {
			const { from, to } = view.state.selection;
			const length = to - from;
			if (length > 0) {
				const tr = view.state.tr.insertText(raw.repeat(length), from, to);
				view.dispatch(tr.scrollIntoView());
			}
			setMeta(view, {
				...CLEAR_TRANSIENT,
				mode: "normal",
				visualAnchor: null,
				linewiseVisual: false,
			});
			collapseCursorAt(view, from);
		} else {
			replaceChars(view, raw, count);
			setMeta(view, CLEAR_TRANSIENT);
		}
		return true;
	}

	if (vim.pending?.kind === "textobject") {
		resolveTextObject(view, raw, vim.pending.around);
		return true;
	}

	if (vim.pending?.kind === "indent") {
		if ((raw === ">" && !vim.pending.outdent) || (raw === "<" && vim.pending.outdent)) {
			indentBlock(view, vim.pending.outdent);
		}
		setMeta(view, CLEAR_TRANSIENT);
		return true;
	}

	const key = KEY_ALIASES[raw] ?? raw;

	if (PASSTHROUGH_KEYS.has(key)) return false;

	if (vim.leader === "g") {
		return handleLeaderG(view, key, count);
	}

	if (vim.leader === "z") {
		return handleLeaderZ(view, key);
	}

	if (vim.operator) {
		return handleOperatorKey(view, vim.operator, key, count, event);
	}

	if (vim.mode === "visual") return handleVisualBase(view, key, count, event);
	return handleNormalBase(view, key, count, event);
}

const DOUBLE_SHIFT_WINDOW_MS = 400;

function isLoneShift(event: KeyboardEvent): boolean {
	return (
		event.key === "Shift" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.repeat
	);
}

/** Ctrl chords vim owns in normal/visual mode; every other ctrl/meta/alt combo
 * passes through untouched so app-level shortcuts keep working. */
const CTRL_KEYS = new Set(["r", "d", "u"]);

function suggestionMenuOpen(view: EditorView): boolean {
	return Boolean(view.dom.ownerDocument.querySelector(".bn-suggestion-menu"));
}

function consume(event: KeyboardEvent) {
	event.preventDefault();
	event.stopPropagation();
}

function reflectMode(view: EditorView, mode: VimMode) {
	view.dom.classList.toggle("vim-normal", mode === "normal");
	view.dom.classList.toggle("vim-insert", mode === "insert");
	view.dom.classList.toggle("vim-visual", mode === "visual");
}

function statusOf(state: EditorState): VimStatus {
	const vim = vimPluginKey.getState(state) ?? INITIAL_STATE;
	return { mode: vim.mode, command: vim.command };
}

/** Block cursor for normal mode: paints the character under the caret (or a
 * standalone block at end-of-line) so the position reads unambiguously, the
 * way a terminal vim cursor does rather than a thin i-beam. */
function blockCursorDecorations(state: EditorState): DecorationSet {
	const vim = vimPluginKey.getState(state) ?? INITIAL_STATE;
	if (vim.mode !== "normal") return DecorationSet.empty;
	const sel = state.selection;
	if (!(sel instanceof TextSelection) || !sel.empty) return DecorationSet.empty;
	const $head = sel.$head;
	if (!$head.parent.isTextblock) return DecorationSet.empty;
	const head = sel.head;
	// A position remains before the block's content end → paint the box over the
	// next leaf, whether that's a character OR an inline atom (mention/link chip),
	// so the cursor never renders in the wrong place before a chip.
	if (head < $head.end()) {
		return DecorationSet.create(state.doc, [
			Decoration.inline(head, head + 1, { class: "vim-cursor" }),
		]);
	}
	const widget = Decoration.widget(
		head,
		() => {
			const span = document.createElement("span");
			span.className = "vim-cursor-eol";
			return span;
		},
		{ side: 1 },
	);
	return DecorationSet.create(state.doc, [widget]);
}

export type VimPluginOptions = {
	onStatusChange?: (status: VimStatus) => void;
	/** Nest / unnest the current block (`>>` / `<<`) — routed to the BlockNote
	 * editor API by the host, since block nesting lives above ProseMirror. */
	onIndent?: () => void;
	onOutdent?: () => void;
};

export function createVimPlugin(options: VimPluginOptions = {}): Plugin<VimState> {
	const { onStatusChange, onIndent, onOutdent } = options;
	let lastShiftAt = 0;
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
			let last = statusOf(view.state);
			reflectMode(view, last.mode);
			onStatusChange?.(last);
			viewHandlers.set(view, { indent: onIndent, outdent: onOutdent });
			// A block cursor drawn filled in an unfocused pane reads as active; go
			// hollow when the editor loses focus, the way a terminal cursor does.
			const setBlurred = () => view.dom.classList.toggle("vim-blurred", !view.hasFocus());
			view.dom.addEventListener("focus", setBlurred);
			view.dom.addEventListener("blur", setBlurred);
			setBlurred();
			return {
				update(updatedView) {
					const status = statusOf(updatedView.state);
					if (status.mode !== last.mode || status.command !== last.command) {
						if (status.mode !== last.mode) reflectMode(updatedView, status.mode);
						last = status;
						onStatusChange?.(status);
					}
				},
				destroy() {
					view.dom.removeEventListener("focus", setBlurred);
					view.dom.removeEventListener("blur", setBlurred);
					viewHandlers.delete(view);
				},
			};
		},
		props: {
			decorations(state) {
				return blockCursorDecorations(state);
			},
			handleKeyDown(view, event) {
				if (event.isComposing) return false;
				if (isLoneShift(event)) {
					const now = Date.now();
					if (now - lastShiftAt <= DOUBLE_SHIFT_WINDOW_MS) {
						lastShiftAt = 0;
						cycleMode(view);
						consume(event);
						return true;
					}
					lastShiftAt = now;
					return false;
				}
				if (event.key !== "Shift") lastShiftAt = 0;

				const vim = vimPluginKey.getState(view.state) ?? INITIAL_STATE;
				if (vim.mode === "insert") {
					if (event.key === "Escape") {
						// An open slash/mention menu owns Escape: it closes the
						// menu and the editor stays in insert mode, like a vim
						// completion popup.
						if (suggestionMenuOpen(view)) return false;
						escapeToNormal(view);
						consume(event);
						return true;
					}
					return false;
				}
				if (!isInTextblock(view.state.selection)) return false;
				if (event.metaKey || event.altKey || (event.ctrlKey && !CTRL_KEYS.has(event.key))) {
					return false;
				}
				// `.` repeat records normal-mode change commands. Only plain keys
				// starting from normal mode are recorded (visual-mode changes and
				// ctrl chords are excluded); the `.` key itself resets any partial.
				const modified = event.ctrlKey || event.metaKey || event.altKey;
				const record =
					!modified && vim.mode === "normal" && !isDotInvocation(vim, event.key);
				if (!modified && vim.mode === "normal" && isDotInvocation(vim, event.key))
					resetDot();
				if (record) beforeCommandKey(view, event.key);
				const handled = handleKey(view, event);
				if (handled) consume(event);
				if (record) afterCommandKey(view);
				return handled;
			},
		},
	});
}
