"use client";

import { useRef, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import type { AiAction, AiEditorHandle } from "@/features/ai/service";
import type { NoteProperty } from "@/domain/notes/properties";
import { NotesEmptyState } from "@/features/notes/components/notes-empty-state";
import { useShortcutHint } from "@/core/shortcuts";
import type { Person } from "@/domain/people/models";
import { useWorkspacePeople } from "@/features/people/hooks/use-people";
import { useCreatePerson } from "@/features/people/hooks/use-create-person";
import { noop } from "@/shared/lib/noop";
import type { NoteFile, RichTextDocument } from "@/types/notes";
import { getEditorFontFamily, type EditorFontId } from "@/shared/lib/editor-fonts";
import {
	getEditorLineHeightValue,
	type EditorLineHeight,
} from "@/features/editor/lib/editor-line-height";
import { hasNoteAssetsSurface, NoteAssetsRows } from "./note-properties/note-assets";
import { EditorContentSkeleton } from "./editor-content-skeleton";
import { preloadRichTextEditor } from "./preload-rich-text-editor";
import type { TRichTextCollab } from "./rich-text-editor";
import type { VimMode } from "@/features/editor/lib/vim-plugin";
import { cn } from "@/shared/lib/utils";

type EditorMode = "raw" | "block";

const EMPTY_PEOPLE: Person[] = [];
const EMPTY_FILES: NoteFile[] = [];

function RichTextEditorLoading() {
	return <EditorContentSkeleton />;
}

// Dynamically import RichTextEditor to avoid SSR issues with BlockNote.
// Must use the same absolute specifier as journal-editor.tsx so both async
// boundaries share one chunk instead of bundling the editor graph twice.
const RichTextEditor = dynamic(
	() =>
		preloadRichTextEditor().then((mod) => ({
			default: mod.RichTextEditor,
		})),
	{
		ssr: false,
		loading: RichTextEditorLoading,
	},
);

type EditorProps = {
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
			properties?: NoteProperty[];
		},
	) => void;
	onIconChange?: (icon: string) => void;
	onCoverChange?: (cover: string) => void;
	onEditorReady?: (handle: AiEditorHandle) => void;
	onAiSpellCheck?: () => void;
	onAiContinueWriting?: () => void;
	onAiAction?: (action: AiAction) => void;
	onAiCustomPrompt?: (instruction: string) => void;
	onTitleCommit?: (title: string) => void;
	onBlur?: () => void;
	onCursorChange?: (position: {
		line: number;
		column: number;
		selection?: { words: number; characters: number };
	}) => void;
	onVimModeChange?: (mode: VimMode | null) => void;
	initialScrollTop?: number;
	onScrollPositionChange?: (scrollTop: number) => void;
	onPaneActivate?: () => void;
	isPaneFocused?: boolean;
	onCreateFile?: () => void;
	collab?: TRichTextCollab;
};

// react-doctor-disable-next-line react-doctor/no-giant-component -- this shell intentionally coordinates both editor modes and their shared pane state in one place.
export function Editor({
	file,
	files = EMPTY_FILES,
	editorMode,
	editorFontId,
	editorLineHeight,
	showLineNumbers = false,
	isMobile = false,
	readOnly = false,
	onContentChange,
	onIconChange,
	onCoverChange,
	onEditorReady,
	onAiSpellCheck,
	onAiContinueWriting,
	onAiAction,
	onAiCustomPrompt,
	onTitleCommit,
	onBlur,
	onCursorChange,
	onVimModeChange,
	initialScrollTop = 0,
	onScrollPositionChange,
	onPaneActivate,
	isPaneFocused,
	onCreateFile,
	collab,
}: EditorProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const gutterRef = useRef<HTMLDivElement>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const cursorAnimationFrameRef = useRef<number | null>(null);
	const scrollReportFrameRef = useRef<number | null>(null);
	const newNoteHint = useShortcutHint("notes.newNote");
	const peopleQuery = useWorkspacePeople();
	const people = peopleQuery.data ?? EMPTY_PEOPLE;
	const createPersonMutation = useCreatePerson();
	const handleCreatePerson = useCallback(
		async (name: string): Promise<Person | null> => {
			const trimmed = name.trim();
			if (!trimmed) return null;
			const existing = people.find(
				(person) => person.name.toLowerCase() === trimmed.toLowerCase(),
			);
			if (existing) return existing;
			try {
				return await createPersonMutation.mutateAsync({
					id: crypto.randomUUID(),
					name: trimmed,
				});
			} catch {
				noop();
				return null;
			}
		},
		[people, createPersonMutation],
	);
	const lineHeightValue = getEditorLineHeightValue(editorLineHeight);
	const lineCount = useMemo(
		() => Math.max(1, (file?.content ?? "").split(/\r?\n/).length),
		[file?.content],
	);
	const fileId = file?.id;

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

	const handlePropertiesChange = useCallback(
		(properties: NoteProperty[]) => {
			if (!file) return;
			onContentChange(file.id, file.content, {
				richContent: file.richContent,
				preferredEditorMode: file.preferredEditorMode,
				properties,
			});
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
		if (!container || !fileId) return;
		container.scrollTop = initialScrollTop;
	}, [fileId, initialScrollTop]);

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
		"flex min-h-full min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-card",
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
			<div className="flex min-h-full flex-1 items-center justify-center bg-card">
				<NotesEmptyState
					className="h-auto"
					title="No file selected"
					description="Choose a note from the sidebar to start writing, or create a new note to begin."
					action={
						onCreateFile
							? {
									label: "New note",
									kbd: isMobile ? undefined : newNoteHint,
									onClick: onCreateFile,
								}
							: undefined
					}
				/>
			</div>
		);
	}

	if (editorMode === "block") {
		return (
			<div
				ref={scrollContainerRef}
				data-editor-scroll=""
				className={containerClass}
				onScroll={reportScrollPosition}
				onPointerDown={handlePanePointerDown}
			>
				<RichTextEditor
					content={file.content}
					richContent={file.richContent}
					files={files}
					people={people}
					onCreatePerson={handleCreatePerson}
					activeFileId={file.id}
					editorFontId={editorFontId}
					editorLineHeight={editorLineHeight}
					readOnly={readOnly}
					onChange={handleRichTextChange}
					properties={file.properties ?? []}
					onPropertiesChange={handlePropertiesChange}
					icon={file.icon}
					cover={file.cover}
					onIconChange={onIconChange}
					onCoverChange={onCoverChange}
					onEditorReady={onEditorReady}
					onAiSpellCheck={onAiSpellCheck}
					onAiContinueWriting={onAiContinueWriting}
					onAiAction={onAiAction}
					onAiCustomPrompt={onAiCustomPrompt}
					onTitleCommit={onTitleCommit}
					onBlur={onBlur}
					onCursorChange={onCursorChange}
					onVimModeChange={onVimModeChange}
					isMobile={isMobile}
					collab={collab}
				/>
			</div>
		);
	}

	const showRawAssets = hasNoteAssetsSurface({
		icon: file.icon,
		cover: file.cover,
		readOnly,
		onIconChange,
		onCoverChange,
	});

	// Raw mode
	return (
		<div
			ref={scrollContainerRef}
			className={containerClass}
			onScroll={reportScrollPosition}
			onPointerDown={handlePanePointerDown}
		>
			<div className={contentClass}>
				{showRawAssets ? (
					<div className="mb-4">
						<NoteAssetsRows
							icon={file.icon}
							cover={file.cover}
							readOnly={readOnly}
							isMobile={isMobile}
							onIconChange={onIconChange}
							onCoverChange={onCoverChange}
						/>
					</div>
				) : null}
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
						data-editor-surface=""
						aria-label="Note editor"
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
							const title = firstNonEmptyLine
								.match(/^#\s+(.+?)\s*#*\s*$/)?.[1]
								?.trim();
							if (title) {
								onTitleCommit?.(title);
							}
							onBlur?.();
						}}
						className={cn(
							"w-full min-h-[80vh] bg-transparent text-foreground/90 text-base md:text-sm resize-none outline-hidden shadow-none focus:shadow-none focus-visible:shadow-none",
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
