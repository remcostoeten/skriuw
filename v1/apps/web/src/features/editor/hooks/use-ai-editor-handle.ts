import { inlineContentToNodes } from "@blocknote/core";
import { useEffect, useRef, type RefObject } from "react";
import {
	inlineChipToText,
	markdownToRichDocument,
	parseInlineContent,
} from "@/domain/notes/rich-document";
import type { AiEditorHandle } from "@/features/ai/service";
import {
	type AiDiffHighlightHandle,
	diffChangedIndices,
	selectCorrectedIndices,
	showAiDiffHighlight,
} from "@/features/editor/lib/ai-diff-highlight";
import { insertMarkdownBelowHeading } from "@/features/editor/lib/ai-tag-insertion";
import {
	type EditorInstance,
	getEditorDom,
	getEditorView,
} from "@/features/editor/lib/editor-instance";
import { blockToPlainText, blocksToMarkdown } from "@/features/editor/lib/editor-serialization";
import { createStreamingApplier } from "@/features/editor/lib/streaming-applier";

type Params = {
	editor: EditorInstance;
	onEditorReady?: (handle: AiEditorHandle) => void;
	wrapperRef: RefObject<HTMLDivElement | null>;
};

function findMergeAnchor(editor: EditorInstance): {
	id: string;
	type?: string;
} | null {
	const doc = editor.document;
	let anchorIndex = doc.length - 1;
	while (anchorIndex >= 0 && blockToPlainText(doc[anchorIndex]).length === 0) {
		anchorIndex -= 1;
	}
	return anchorIndex >= 0 ? doc[anchorIndex] : null;
}

export function useAiEditorHandle({ editor, onEditorReady, wrapperRef }: Params) {
	const aiDiffHighlightRef = useRef<AiDiffHighlightHandle | null>(null);

	useEffect(() => {
		if (!onEditorReady) return;

		function highlightBlocks(ids: string[]) {
			if (ids.length === 0) return;
			aiDiffHighlightRef.current?.cancel();
			let attempts = 0;
			const resolve = () => {
				const root = wrapperRef.current ?? getEditorDom(editor);
				const els = root
					? ids
							.map((id) =>
								root.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`),
							)
							.filter((el): el is HTMLElement => el !== null)
					: [];
				if (els.length > 0) {
					aiDiffHighlightRef.current = showAiDiffHighlight(els);
					return;
				}
				attempts += 1;
				if (attempts < 40) requestAnimationFrame(resolve);
			};
			requestAnimationFrame(resolve);
		}

		// Range captured when a selection-scoped AI action reads the selection, so
		// the replacement lands on the original text even if focus moved during
		// the async AI round-trip.
		let capturedSelection: { from: number; to: number } | null = null;

		onEditorReady({
			getMarkdown: () => blocksToMarkdown(editor),
			getSelectionText: () => {
				const view = getEditorView(editor);
				if (!view) return "";
				const selection = view.state.selection;
				if (selection.empty) {
					capturedSelection = null;
					return "";
				}
				capturedSelection = { from: selection.from, to: selection.to };
				// Chips (tags/people/wikilinks) are atom leaf nodes with no text,
				// so serialize them as their typed syntax — the AI sees `#tag` /
				// `$[Name](person://id)` instead of a hole in the sentence.
				return view.state.doc.textBetween(
					selection.from,
					selection.to,
					"\n",
					(leaf: { type: { name: string }; attrs: Record<string, unknown> }) =>
						inlineChipToText(leaf.type.name, leaf.attrs) ?? "",
				);
			},
			replaceSelection: (text) => {
				const view = getEditorView(editor);
				const range = capturedSelection;
				capturedSelection = null;
				if (!view || !range) return;
				if (range.to > view.state.doc.content.size) return;
				try {
					const content = parseInlineContent(text);
					// biome-ignore lint/suspicious/noExplicitAny: schema-shaped inline content
					const nodes = inlineContentToNodes(content as any, view.state.schema);
					view.dispatch(view.state.tr.replaceWith(range.from, range.to, nodes));
				} catch {
					view.dispatch(view.state.tr.insertText(text, range.from, range.to));
				}
			},
			appendMarkdown: (markdown) => {
				const blocks = markdownToRichDocument(markdown);
				if (blocks.length === 0) return;
				const doc = editor.document;
				const last = doc[doc.length - 1];
				if (!last) return;
				// biome-ignore lint/suspicious/noExplicitAny: schema-shaped blocks
				const inserted = editor.insertBlocks(blocks as any, last, "after");
				highlightBlocks(inserted.map((b: { id: string }) => b.id));
			},
			insertMarkdownBelowHeading: (markdown) => {
				const insertedIds = insertMarkdownBelowHeading(editor, markdown);
				highlightBlocks(insertedIds);
				return insertedIds.length > 0;
			},
			beginStreamingContinue: () =>
				createStreamingApplier({
					editor,
					onHighlight: highlightBlocks,
					placeFirst: (blocks) => {
						const anchor = findMergeAnchor(editor);
						const anchorType = anchor?.type;
						if (anchor && (anchorType === "paragraph" || anchorType === "quote")) {
							const { insertedBlocks } = editor.replaceBlocks(
								[anchor],
								// biome-ignore lint/suspicious/noExplicitAny: schema-shaped blocks
								blocks as any,
							);
							return insertedBlocks.map((b: { id: string }) => b.id);
						}
						const doc = editor.document;
						const reference = anchor ?? doc[doc.length - 1];
						const inserted = editor.insertBlocks(
							// biome-ignore lint/suspicious/noExplicitAny: schema-shaped blocks
							blocks as any,
							reference,
							"after",
						);
						return inserted.map((b: { id: string }) => b.id);
					},
				}),
			beginStreamingCustomPrompt: () =>
				createStreamingApplier({
					editor,
					onHighlight: highlightBlocks,
					// Always inserts after the cursor (or last block) rather than merging,
					// so a free-form instruction can never silently overwrite prose.
					placeFirst: (blocks) => {
						let reference: { id: string } | null = null;
						try {
							reference = editor.getTextCursorPosition?.().block ?? null;
						} catch {
							reference = null;
						}
						const doc = editor.document;
						reference = reference ?? doc[doc.length - 1] ?? null;
						if (!reference) return [];
						const inserted = editor.insertBlocks(
							// biome-ignore lint/suspicious/noExplicitAny: schema-shaped blocks
							blocks as any,
							reference,
							"after",
						);
						return inserted.map((b: { id: string }) => b.id);
					},
				}),
			deleteBlocks: (ids) => {
				const docIds = new Set(editor.document.map((b: { id: string }) => b.id));
				const existing = ids.filter((id) => docIds.has(id));
				if (existing.length === 0) return;
				editor.removeBlocks(existing);
			},
			replaceContent: (markdown) => {
				const beforeTexts = editor.document.map(blockToPlainText);
				const parsed = markdownToRichDocument(markdown);
				const parsedTexts = parsed.map(blockToPlainText);
				const corrected =
					parsed.length > beforeTexts.length
						? selectCorrectedIndices(beforeTexts, parsedTexts).map((k) => parsed[k])
						: parsed;
				// biome-ignore lint/suspicious/noExplicitAny: schema-shaped blocks
				editor.replaceBlocks(editor.document, corrected as any);
				const afterBlocks = editor.document;
				const afterTexts = afterBlocks.map(blockToPlainText);
				const changedIds = diffChangedIndices(beforeTexts, afterTexts).reduce<string[]>(
					(acc, index) => {
						if (afterTexts[index].length > 0) acc.push(afterBlocks[index].id);
						return acc;
					},
					[],
				);
				highlightBlocks(changedIds);
			},
			continueWriting: (markdown) => {
				const blocks = markdownToRichDocument(markdown);
				if (blocks.length === 0) return;
				const anchor = findMergeAnchor(editor);
				const anchorType = anchor?.type;
				if (anchor && (anchorType === "paragraph" || anchorType === "quote")) {
					// The model restates the cut-off final paragraph as its first block,
					// then continues. Replacing the anchor merges that completion in
					// place instead of orphaning a half-finished line above new text.
					const { insertedBlocks } = editor.replaceBlocks(
						[anchor],
						// biome-ignore lint/suspicious/noExplicitAny: schema-shaped blocks
						blocks as any,
					);
					highlightBlocks(insertedBlocks.map((b: { id: string }) => b.id));
					return;
				}
				const doc = editor.document;
				const reference = anchor ?? doc[doc.length - 1];
				const inserted = editor.insertBlocks(
					// biome-ignore lint/suspicious/noExplicitAny: schema-shaped blocks
					blocks as any,
					reference,
					"after",
				);
				highlightBlocks(inserted.map((b: { id: string }) => b.id));
			},
			setTitle: (title: string) => {
				const firstBlock = editor.document[0];
				if (!firstBlock) return;
				// biome-ignore lint/suspicious/noExplicitAny: custom schema block shape
				const content = [{ type: "text", text: title, styles: {} }] as any;
				if ((firstBlock as { type?: string }).type === "heading") {
					editor.updateBlock(firstBlock, { content });
				} else {
					// biome-ignore lint/suspicious/noExplicitAny: custom schema block shape
					editor.insertBlocks(
						[{ type: "heading", props: { level: 1 }, content }] as any,
						firstBlock,
						"before",
					);
				}
			},
		});
		return () => {
			aiDiffHighlightRef.current?.cancel();
			aiDiffHighlightRef.current = null;
		};
	}, [editor, onEditorReady, wrapperRef]);
}
