import { useEffect, useState } from "react";

// biome-ignore lint/suspicious/noExplicitAny: BlockNote editor is loosely typed here
export type EditorInstance = any;

// BlockNote 0.46 runs on TipTap 3, whose `editor.view` getter returns a *proxy*
// (truthy, not null) until the ProseMirror view is mounted; reading any property
// other than `state` on that proxy — `dom` in particular — throws "[tiptap
// error]: ... Cannot access view['dom']". `editor.prosemirrorView` and
// `editor.domElement` both route through that proxy, so the usual `?.` / truthy
// guards don't protect against it (the proxy passes them). These read the real
// view object directly, which is genuinely null before mount / after unmount.
export function getEditorView(editor: EditorInstance): EditorInstance | null {
	return editor?._tiptapEditor?.editorView ?? null;
}

export function getEditorDom(editor: EditorInstance): HTMLElement | null {
	return getEditorView(editor)?.dom ?? null;
}

// Tracks the live editor DOM element across mount/unmount, so effects that wire
// listeners onto it re-run when the view actually attaches instead of reading a
// transient `undefined` (or throwing) during the mount race.
export function useEditorDom(editor: EditorInstance): HTMLElement | null {
	const [dom, setDom] = useState<HTMLElement | null>(() => getEditorDom(editor));

	useEffect(() => {
		const tiptap = editor?._tiptapEditor;
		if (!tiptap) return;
		const sync = () => setDom(getEditorDom(editor));
		sync();
		tiptap.on("mount", sync);
		tiptap.on("unmount", sync);
		return () => {
			tiptap.off("mount", sync);
			tiptap.off("unmount", sync);
		};
	}, [editor]);

	return dom;
}
