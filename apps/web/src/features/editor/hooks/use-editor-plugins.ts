import { useEffect, useMemo, useRef } from "react";
import type { Plugin } from "prosemirror-state";
import { createSearchPlugin, searchPluginKey } from "@/features/editor/lib/search-plugin";
import {
	codeBlockIndentPluginKey,
	createCodeBlockIndentPlugin,
} from "@/features/editor/lib/code-block-indent-plugin";
import {
	createInlineChipNavPlugin,
	inlineChipNavPluginKey,
} from "@/features/editor/lib/inline-chip-nav-plugin";
import { createVimPlugin, vimPluginKey, type VimMode } from "@/features/editor/lib/vim-plugin";
import { createSelectAllPlugin, selectAllPluginKey } from "@/features/editor/lib/select-all-plugin";
import { type EditorInstance, getEditorDom } from "@/features/editor/lib/editor-instance";

type Params = {
	editor: EditorInstance;
	readOnly: boolean;
	vimModeEnabled: boolean;
	onVimModeChange?: (mode: VimMode | null) => void;
	setVimCommand: (command: string | null) => void;
	onOpenNoteLink: (title: string) => void;
	onOpenPerson: (id: string) => void;
	onOpenTag: (name: string) => void;
};

export function useEditorPlugins({
	editor,
	readOnly,
	vimModeEnabled,
	onVimModeChange,
	setVimCommand,
	onOpenNoteLink,
	onOpenPerson,
	onOpenTag,
}: Params) {
	const searchPlugin = useMemo(() => createSearchPlugin(), []);
	const onVimModeChangeRef = useRef(onVimModeChange);
	onVimModeChangeRef.current = onVimModeChange;
	const onOpenNoteLinkRef = useRef(onOpenNoteLink);
	onOpenNoteLinkRef.current = onOpenNoteLink;
	const onOpenPersonRef = useRef(onOpenPerson);
	onOpenPersonRef.current = onOpenPerson;
	const onOpenTagRef = useRef(onOpenTag);
	onOpenTagRef.current = onOpenTag;

	useEffect(() => {
		const tiptap = editor._tiptapEditor;
		if (!tiptap) return;
		tiptap.registerPlugin(searchPlugin);
		return () => {
			tiptap.unregisterPlugin(searchPluginKey);
		};
	}, [editor, searchPlugin]);

	useEffect(() => {
		const tiptap = editor._tiptapEditor;
		if (!tiptap || readOnly) return;
		// Prepend so it wins over ProseMirror's default `Mod-a`, which selects
		// the whole document in one press instead of block-first.
		tiptap.registerPlugin(
			createSelectAllPlugin(),
			(selectAllPlugin: Plugin, plugins: Plugin[]) => [selectAllPlugin, ...plugins],
		);
		return () => {
			tiptap.unregisterPlugin(selectAllPluginKey);
		};
	}, [editor, readOnly]);

	useEffect(() => {
		const tiptap = editor._tiptapEditor;
		if (!tiptap || readOnly) return;
		// Prepend so ProseMirror sees Tab before BlockNote's built-in code-block
		// shortcut, which hardcodes a two-space indent — we want four.
		tiptap.registerPlugin(
			createCodeBlockIndentPlugin(),
			(indentPlugin: Plugin, plugins: Plugin[]) => [indentPlugin, ...plugins],
		);
		return () => {
			tiptap.unregisterPlugin(codeBlockIndentPluginKey);
		};
	}, [editor, readOnly]);

	useEffect(() => {
		const tiptap = editor._tiptapEditor;
		if (!tiptap || !vimModeEnabled || readOnly) return;
		const plugin = createVimPlugin({
			onStatusChange: (status) => {
				onVimModeChangeRef.current?.(status.mode);
				setVimCommand(status.command);
			},
			onIndent: () => {
				if (editor.canNestBlock?.()) editor.nestBlock?.();
			},
			onOutdent: () => {
				if (editor.canUnnestBlock?.()) editor.unnestBlock?.();
			},
		});
		// Prepend: BlockNote ships an `OverrideEscape` keymap that blurs the
		// editor on Escape, and ProseMirror consults plugins in order — vim must
		// see keys first or Escape kicks the user out of the editor.
		tiptap.registerPlugin(plugin, (vimPlugin: Plugin, plugins: Plugin[]) => [
			vimPlugin,
			...plugins,
		]);
		onVimModeChangeRef.current?.("normal");
		return () => {
			tiptap.unregisterPlugin(vimPluginKey);
			getEditorDom(editor)?.classList.remove("vim-normal", "vim-insert", "vim-visual");
			setVimCommand(null);
			onVimModeChangeRef.current?.(null);
		};
	}, [editor, vimModeEnabled, readOnly, setVimCommand]);

	// Registered last (and re-registered whenever vim toggles) so it prepends in
	// front of every other plugin — inline chip activation must route before
	// BlockNote splits the block or vim's `Enter → j` motion fires.
	useEffect(() => {
		const tiptap = editor._tiptapEditor;
		if (!tiptap) return;
		tiptap.registerPlugin(
			createInlineChipNavPlugin({
				onOpenNoteLink: (title) => onOpenNoteLinkRef.current(title),
				onOpenPerson: (id) => onOpenPersonRef.current(id),
				onOpenTag: (name) => onOpenTagRef.current(name),
			}),
			(navPlugin: Plugin, plugins: Plugin[]) => [navPlugin, ...plugins],
		);
		return () => {
			tiptap.unregisterPlugin(inlineChipNavPluginKey);
		};
	}, [editor, vimModeEnabled, readOnly]);
}
