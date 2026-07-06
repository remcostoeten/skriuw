"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnchoredMarkStore, getAnchoredMarkMap } from "../store";
import { MarkRendererRegistry } from "../registry";
import { AnchoredMarksEngine } from "../engine";
import { anchoredMarksPlugin, anchoredMarksPluginKey } from "../prosemirror/plugin";
import { commentRenderer, COMMENT_MARK_TYPE, type TCommentPayload } from "../renderers/comment";

type TRange = { from: number; to: number };

/** Minimal shape we need from the collab room — kept loose to avoid coupling. */
type TCollabLike =
	| {
			doc: { clientID: number } & Parameters<typeof getAnchoredMarkMap>[0];
			user: { name: string; color: string } | null;
	  }
	| null
	| undefined;

export type TUseAnchoredMarks = {
	/** True once the engine is attached to a live, Yjs-bound editor view. */
	ready: boolean;
	/** Anchor a comment to a range; no-op until `ready`. */
	addComment: (range: TRange, body: string) => void;
};

/**
 * Wires the anchored-marks engine to a BlockNote editor for the lifetime of a
 * collaborative note. Registers the decoration plugin through TipTap (BlockNote's
 * underlying editor) rather than reconfiguring ProseMirror by hand, and tears
 * everything down on unmount. Does nothing on solo notes (no `collab.doc`).
 */
export function useAnchoredMarks(editor: any, collab: TCollabLike): TUseAnchoredMarks {
	const engineRef = useRef<AnchoredMarksEngine | null>(null);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		if (!editor || !collab?.doc) return;

		const tiptap = editor._tiptapEditor;
		const view = editor.prosemirrorView;
		if (!tiptap || !view) return;

		tiptap.registerPlugin(anchoredMarksPlugin());

		const store = new AnchoredMarkStore(getAnchoredMarkMap(collab.doc));
		const registry = new MarkRendererRegistry([commentRenderer()]);
		const engine = new AnchoredMarksEngine(collab.doc, store, registry);
		engine.attach(view);
		engineRef.current = engine;
		setReady(true);

		return () => {
			engine.dispose();
			tiptap.unregisterPlugin(anchoredMarksPluginKey);
			engineRef.current = null;
			setReady(false);
		};
	}, [editor, collab?.doc]);

	const addComment = useCallback(
		(range: TRange, body: string) => {
			const engine = engineRef.current;
			if (!engine || !collab?.doc) return;
			const author = {
				id: String(collab.doc.clientID),
				name: collab.user?.name ?? "Someone",
				color: collab.user?.color ?? "#7c3aed",
			};
			const payload: TCommentPayload = { body, replies: [] };
			engine.create(range, {
				id: crypto.randomUUID(),
				type: COMMENT_MARK_TYPE,
				author,
				payload,
				createdAt: Date.now(),
			});
		},
		[collab?.doc, collab?.user],
	);

	return { ready, addComment };
}
