import { noop } from "@/shared/lib/noop";
import type { EditorInstance } from "@/features/editor/lib/editor-instance";

function getTargetBlocks(editor: EditorInstance): { id: string }[] {
	const selection = editor.getSelection?.();
	if (selection?.blocks?.length) {
		return selection.blocks;
	}
	try {
		return [editor.getTextCursorPosition().block];
	} catch {
		noop();
		return [];
	}
}

export function applyBlockType(
	editor: EditorInstance,
	type: string,
	props: Record<string, unknown>,
) {
	for (const block of getTargetBlocks(editor)) {
		editor.updateBlock(block, { props, type });
	}
	editor.focus();
}

export function applyAlignment(editor: EditorInstance, textAlignment: string) {
	for (const block of getTargetBlocks(editor)) {
		editor.updateBlock(block, { props: { textAlignment } });
	}
	editor.focus();
}
