import { NodeSelection, Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import { vimPluginKey } from "@/features/editor/lib/vim-plugin";

export type InlineChipNavHandlers = {
	onOpenNoteLink: (title: string) => void;
	onOpenPerson: (id: string) => void;
	onOpenTag: (name: string) => void;
};

type InlineChipNodeType = "noteLink" | "person" | "tag";

const NAVIGABLE_INLINE_CHIP_TYPES = new Set<InlineChipNodeType>(["noteLink", "person", "tag"]);

export const inlineChipNavPluginKey = new PluginKey("inline-chip-nav");

type InlineChipSelection = {
	type: InlineChipNodeType;
	pos: number;
	node: PMNode;
};

function isChipType(typeName: string): typeName is InlineChipNodeType {
	return NAVIGABLE_INLINE_CHIP_TYPES.has(typeName as InlineChipNodeType);
}

function getSelectedChip(view: EditorView): InlineChipSelection | null {
	const { selection } = view.state;

	if (!(selection instanceof NodeSelection)) {
		return null;
	}

	const { node } = selection;
	if (!isChipType(node.type.name)) {
		return null;
	}

	return { type: node.type.name, pos: selection.from, node };
}

function getAdjacentChip(view: EditorView, direction: -1 | 1): InlineChipSelection | null {
	const { selection } = view.state;
	if (!selection.empty || !selection.$from.parent.isTextblock) {
		return null;
	}

	if (direction === -1) {
		const node = selection.$from.nodeBefore;
		if (!node || !isChipType(node.type.name)) {
			return null;
		}
		return {
			type: node.type.name,
			pos: selection.$from.pos - node.nodeSize,
			node,
		};
	}

	const node = selection.$from.nodeAfter;
	if (!node || !isChipType(node.type.name)) {
		return null;
	}

	return {
		type: node.type.name,
		pos: selection.$from.pos,
		node,
	};
}

function selectChip(view: EditorView, chip: InlineChipSelection) {
	const tr = view.state.tr.setSelection(NodeSelection.create(view.state.doc, chip.pos));
	view.dispatch(tr.scrollIntoView());
}

function deleteRange(view: EditorView, from: number, to: number) {
	const tr = view.state.tr.delete(from, to);
	const clamped = Math.min(from, tr.doc.content.size);
	tr.setSelection(TextSelection.create(tr.doc, clamped));
	view.dispatch(tr.scrollIntoView());
}

function openChip(view: EditorView, chip: InlineChipSelection, handlers: InlineChipNavHandlers) {
	if (chip.type === "person") {
		const id = String(chip.node.attrs.id ?? "");
		if (id) handlers.onOpenPerson(id);
		return;
	}

	if (chip.type === "tag") {
		const name = String(chip.node.attrs.name ?? "").trim();
		if (name) handlers.onOpenTag(name);
		return;
	}

	const title = String(chip.node.attrs.title ?? "").trim();
	if (title) handlers.onOpenNoteLink(title);
}

export function createInlineChipNavPlugin(handlers: InlineChipNavHandlers): Plugin {
	return new Plugin({
		key: inlineChipNavPluginKey,
		props: {
			handleKeyDown(view, event) {
				if (event.defaultPrevented || event.isComposing) {
					return false;
				}
				if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
					return false;
				}

				// In vim normal mode, `h`/`l` are the arrow-key equivalents — without
				// this, they fall through to vim's text-offset motion, which steps
				// straight through a chip's leaf position instead of ever selecting
				// it, so it can never be opened with Enter from the keyboard.
				const vimMode = vimPluginKey.getState(view.state)?.mode;
				const isVimLeft = vimMode === "normal" && event.key === "h";
				const isVimRight = vimMode === "normal" && event.key === "l";

				if (
					event.key === "ArrowLeft" ||
					event.key === "ArrowRight" ||
					isVimLeft ||
					isVimRight
				) {
					const direction = event.key === "ArrowLeft" || isVimLeft ? -1 : 1;

					// A chip is already selected (NodeSelection) — step out of it to
					// the requested side instead of leaving it to vim's text-offset
					// motion, which doesn't understand NodeSelection.
					const selectedChip = getSelectedChip(view);
					if (selectedChip) {
						const pos =
							direction === -1
								? selectedChip.pos
								: selectedChip.pos + selectedChip.node.nodeSize;
						event.preventDefault();
						const tr = view.state.tr.setSelection(
							TextSelection.create(view.state.doc, pos),
						);
						view.dispatch(tr.scrollIntoView());
						return true;
					}

					const chip = getAdjacentChip(view, direction);
					if (!chip) {
						return false;
					}

					event.preventDefault();
					selectChip(view, chip);
					return true;
				}

				if (event.key === "Enter") {
					const chip = getSelectedChip(view);
					if (!chip) {
						return false;
					}

					event.preventDefault();
					openChip(view, chip, handlers);
					return true;
				}

				if (event.key === "Backspace" || event.key === "Delete") {
					const selectedChip = getSelectedChip(view);
					if (selectedChip) {
						event.preventDefault();
						deleteRange(
							view,
							selectedChip.pos,
							selectedChip.pos + selectedChip.node.nodeSize,
						);
						return true;
					}

					const chip = getAdjacentChip(view, event.key === "Backspace" ? -1 : 1);
					if (!chip) {
						return false;
					}

					event.preventDefault();
					deleteRange(view, chip.pos, chip.pos + chip.node.nodeSize);
					return true;
				}

				return false;
			},
		},
	});
}
