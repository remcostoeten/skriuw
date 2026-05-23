"use client";

import { useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { EmptyState } from "@/shared/ui/empty-state";
import type { AiEditorHandle } from "@/features/ai/service";
import type { NoteFile, RichTextDocument } from "@/types/notes";
import { getEditorFontFamily, type EditorFontId } from "@/shared/lib/editor-fonts";
import {
	getEditorLineHeightValue,
	type EditorLineHeight,
} from "@/features/editor/lib/editor-line-height";
import { EditorContentSkeleton } from "./editor-content-skeleton";

type EditorMode = "raw" | "block";

function RichTextEditorLoading() {
	return <EditorContentSkeleton />;
}

// Dynamically import RichTextEditor to avoid SSR issues with BlockNote
const RichTextEditor = dynamic(
	() => import("./rich-text-editor").then((mod) => ({ default: mod.RichTextEditor })),
	{
		ssr: false,
		loading: RichTextEditorLoading,
	},
);

interface EditorProps {
	file: NoteFile | null;
	files?: NoteFile[];
	editorMode: EditorMode;
	editorFontId: EditorFontId;
	editorLineHeight: EditorLineHeight;
	isMobile?: boolean;
	readOnly?: boolean;
	onContentChange: (
		id: string,
		content: string,
		options?: {
			richContent?: RichTextDocument;
			preferredEditorMode?: EditorMode;
		},
	) => void;
	onEditorReady?: (handle: AiEditorHandle) => void;
	onAiSpellCheck?: () => void;
	onAiContinueWriting?: () => void;
	onTitleCommit?: (title: string) => void;
	onBlur?: () => void;
	onCursorChange?: (position: {
		line: number;
		column: number;
		selection?: { words: number; characters: number };
	}) => void;
}

export function Editor({
	file,
	files = [],
	editorMode,
	editorFontId,
	editorLineHeight,
	readOnly = false,
	onContentChange,
	onEditorReady,
	onAiSpellCheck,
	onAiContinueWriting,
	onTitleCommit,
	onBlur,
	onCursorChange,
}: EditorProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const cursorAnimationFrameRef = useRef<number | null>(null);

	// Auto-resize textarea
	useEffect(() => {
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
			textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
		}
	}, [file?.content]);

	const handleMarkdownChange = useCallback(
		(content: string) => {
			if (file) {
				onContentChange(file.id, content);
			}
		},
		[file, onContentChange],
	);

	const handleRichTextChange = useCallback(
		(next: { markdown: string; richContent: RichTextDocument }) => {
			if (file) {
				onContentChange(file.id, next.markdown, {
					richContent: next.richContent,
					preferredEditorMode: "block",
				});
			}
		},
		[file, onContentChange],
	);

	const reportTextareaCursor = useCallback(() => {
		const textarea = textareaRef.current;
		if (!textarea || !onCursorChange) return;
		const cursorOffset = textarea.selectionStart ?? 0;
		const beforeCursor = textarea.value.slice(0, cursorOffset);
		const lines = beforeCursor.split(/\r?\n/);
		const selectionStart = textarea.selectionStart ?? cursorOffset;
		const selectionEnd = textarea.selectionEnd ?? cursorOffset;
		const selectedText =
			selectionEnd > selectionStart ? textarea.value.slice(selectionStart, selectionEnd) : "";
		const selectedWords = selectedText.trim()
			? selectedText.trim().split(/\s+/).filter(Boolean).length
			: 0;
		onCursorChange({
			line: lines.length,
			column: (lines.at(-1)?.length ?? 0) + 1,
			selection: selectedText
				? {
						words: selectedWords,
						characters: selectedText.length,
					}
				: undefined,
		});
	}, [onCursorChange]);

	const queueTextareaCursorReport = useCallback(() => {
		if (cursorAnimationFrameRef.current !== null) {
			window.cancelAnimationFrame(cursorAnimationFrameRef.current);
		}

		cursorAnimationFrameRef.current = window.requestAnimationFrame(() => {
			cursorAnimationFrameRef.current = null;
			reportTextareaCursor();
		});
	}, [reportTextareaCursor]);

	useEffect(() => {
		return () => {
			if (cursorAnimationFrameRef.current !== null) {
				window.cancelAnimationFrame(cursorAnimationFrameRef.current);
			}
		};
	}, []);

	if (!file) {
		return (
			<div className="flex min-h-full flex-1 items-center justify-center bg-card px-6 py-12">
				<EmptyState
					variant="files"
					title="No file selected"
					description="Choose a note from the sidebar to start writing."
					className="[&_svg]:mb-4 [&_svg]:h-8 [&_svg]:w-8 [&_h2]:text-[15px] [&_p]:mt-1.5 [&_p]:max-w-[240px] [&_p]:text-[13px]"
				/>
			</div>
		);
	}
	const containerClass = "flex min-h-full flex-1 flex-col overflow-y-auto bg-card";
	const contentClass = "mx-auto w-full max-w-3xl px-4 pb-28 pt-5 sm:px-8 sm:py-8";

	if (editorMode === "block") {
		return (
			<div className={containerClass}>
				<RichTextEditor
					content={file.content}
					richContent={file.richContent}
					files={files}
					activeFileId={file.id}
					editorFontId={editorFontId}
					editorLineHeight={editorLineHeight}
					readOnly={readOnly}
					onChange={handleRichTextChange}
					onEditorReady={onEditorReady}
					onAiSpellCheck={onAiSpellCheck}
					onAiContinueWriting={onAiContinueWriting}
					onTitleCommit={onTitleCommit}
					onBlur={onBlur}
					onCursorChange={onCursorChange}
				/>
			</div>
		);
	}

	// Raw mode
	return (
		<div className={containerClass}>
			<div className={contentClass}>
				<textarea
					ref={textareaRef}
					value={file.content}
					readOnly={readOnly}
					onChange={(e) => {
						handleMarkdownChange(e.target.value);
						queueTextareaCursorReport();
					}}
					onClick={queueTextareaCursorReport}
					onFocus={queueTextareaCursorReport}
					onKeyUp={queueTextareaCursorReport}
					onMouseUp={queueTextareaCursorReport}
					onPointerUp={queueTextareaCursorReport}
					onSelect={queueTextareaCursorReport}
					onBlur={(event) => {
						const firstNonEmptyLine =
							event.currentTarget.value
								.split(/\r?\n/)
								.find((line) => line.trim().length > 0) ?? "";
						const title = firstNonEmptyLine.match(/^#\s+(.+?)\s*#*\s*$/)?.[1]?.trim();
						if (title) {
							onTitleCommit?.(title);
						}
						onBlur?.();
					}}
					className="w-full min-h-[80vh] bg-transparent text-foreground/90 text-sm resize-none outline-hidden"
					style={{
						fontFamily: getEditorFontFamily(editorFontId),
						lineHeight: getEditorLineHeightValue(editorLineHeight),
					}}
					spellCheck={false}
				/>
			</div>
		</div>
	);
}
