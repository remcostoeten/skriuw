"use client";

import { useRef, useEffect, useCallback, useMemo } from "react";
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
import { cn } from "@/shared/lib/utils";

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
	showLineNumbers?: boolean;
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
	initialScrollTop?: number;
	onScrollPositionChange?: (scrollTop: number) => void;
	onPaneActivate?: () => void;
	isPaneFocused?: boolean;
}

export function Editor({
	file,
	files = [],
	editorMode,
	editorFontId,
	editorLineHeight,
	showLineNumbers = false,
	readOnly = false,
	onContentChange,
	onEditorReady,
	onAiSpellCheck,
	onAiContinueWriting,
	onTitleCommit,
	onBlur,
	onCursorChange,
	initialScrollTop = 0,
	onScrollPositionChange,
	onPaneActivate,
	isPaneFocused,
}: EditorProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const gutterRef = useRef<HTMLDivElement>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const cursorAnimationFrameRef = useRef<number | null>(null);
	const scrollReportFrameRef = useRef<number | null>(null);
	const lineHeightValue = getEditorLineHeightValue(editorLineHeight);
	const lineCount = useMemo(
		() => Math.max(1, (file?.content ?? "").split(/\r?\n/).length),
		[file?.content],
	);

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
			if (scrollReportFrameRef.current !== null) {
				window.cancelAnimationFrame(scrollReportFrameRef.current);
			}
		};
	}, []);

	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container || !file) return;
		container.scrollTop = initialScrollTop;
	}, [file?.id, initialScrollTop]);

	const reportScrollPosition = useCallback(() => {
		const container = scrollContainerRef.current;
		if (!container || !file || !onScrollPositionChange) return;
		if (scrollReportFrameRef.current !== null) {
			window.cancelAnimationFrame(scrollReportFrameRef.current);
		}
		scrollReportFrameRef.current = window.requestAnimationFrame(() => {
			scrollReportFrameRef.current = null;
			onScrollPositionChange(container.scrollTop);
		});
	}, [file, onScrollPositionChange]);

	const containerClass = cn(
		"flex min-h-full flex-1 flex-col overflow-y-auto bg-card",
		isPaneFocused === false && "opacity-95",
		isPaneFocused === true && "ring-1 ring-inset ring-foreground/12",
	);
	const contentClass = "mx-auto w-full max-w-3xl px-4 pb-28 pt-5 sm:px-8 sm:py-8";

	const syncGutterScroll = useCallback(() => {
		const textarea = textareaRef.current;
		const gutter = gutterRef.current;
		if (!textarea || !gutter) return;
		gutter.scrollTop = textarea.scrollTop;
	}, []);

	const handlePanePointerDown = useCallback(() => {
		onPaneActivate?.();
	}, [onPaneActivate]);

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

	if (editorMode === "block") {
		return (
			<div
				ref={scrollContainerRef}
				className={containerClass}
				onScroll={reportScrollPosition}
				onPointerDown={handlePanePointerDown}
			>
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
		<div
			ref={scrollContainerRef}
			className={containerClass}
			onScroll={reportScrollPosition}
			onPointerDown={handlePanePointerDown}
		>
			<div className={contentClass}>
				<div className={showLineNumbers ? "flex items-start gap-3" : undefined}>
					{showLineNumbers ? (
						<div
							ref={gutterRef}
							aria-hidden="true"
							className="sticky top-5 max-h-[80vh] overflow-hidden select-none pt-px text-right font-mono text-[11px] leading-[inherit] text-muted-foreground/45"
							style={{
								lineHeight: lineHeightValue,
								minWidth: `${String(lineCount).length + 0.5}ch`,
							}}
						>
							{Array.from({ length: lineCount }, (_, index) => (
								<div key={index + 1}>{index + 1}</div>
							))}
						</div>
					) : null}
					<textarea
						ref={textareaRef}
						value={file.content}
						readOnly={readOnly}
						onChange={(e) => {
							handleMarkdownChange(e.target.value);
							queueTextareaCursorReport();
						}}
						onScroll={(event) => {
							syncGutterScroll();
							reportScrollPosition();
							if (event.currentTarget !== textareaRef.current) return;
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
						className={cn(
							"w-full min-h-[80vh] bg-transparent text-foreground/90 text-base md:text-sm resize-none outline-hidden",
							showLineNumbers && "flex-1",
						)}
						style={{
							fontFamily: getEditorFontFamily(editorFontId),
							lineHeight: lineHeightValue,
						}}
						spellCheck={false}
					/>
				</div>
			</div>
		</div>
	);
}
