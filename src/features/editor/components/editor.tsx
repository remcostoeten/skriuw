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

type EditorMode = "raw" | "block";

function RichTextEditorLoading() {
	return (
		<div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-5 sm:px-8 sm:py-8">
			<div className="space-y-5" aria-hidden="true">
				<div className="h-px w-full bg-foreground/[0.08]" />
				<div className="h-px w-10/12 bg-foreground/[0.07]" />
				<div className="h-px w-7/12 bg-foreground/[0.06]" />
			</div>
		</div>
	);
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
}

export function Editor({
	file,
	files = [],
	editorMode,
	editorFontId,
	editorLineHeight,
	onContentChange,
	onEditorReady,
	onAiSpellCheck,
	onAiContinueWriting,
	onTitleCommit,
}: EditorProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);

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
					onChange={handleRichTextChange}
					onEditorReady={onEditorReady}
					onAiSpellCheck={onAiSpellCheck}
					onAiContinueWriting={onAiContinueWriting}
					onTitleCommit={onTitleCommit}
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
					onChange={(e) => handleMarkdownChange(e.target.value)}
					onBlur={(event) => {
						const firstNonEmptyLine =
							event.currentTarget.value
								.split(/\r?\n/)
								.find((line) => line.trim().length > 0) ?? "";
						const title = firstNonEmptyLine.match(/^#\s+(.+?)\s*#*\s*$/)?.[1]?.trim();
						if (title) {
							onTitleCommit?.(title);
						}
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
