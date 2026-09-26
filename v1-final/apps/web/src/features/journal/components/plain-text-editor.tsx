"use client";

import { useEffect, useRef } from "react";
import { getEditorFontFamily, type EditorFontId } from "@/shared/lib/editor-fonts";
import {
	getEditorLineHeightValue,
	type EditorLineHeight,
} from "@/features/editor/lib/editor-line-height";

type PlainTextEditorProps = {
	content: string;
	onChange: (content: string) => void;
	editorFontId?: EditorFontId;
	editorLineHeight?: EditorLineHeight;
	placeholder?: string;
};

export function PlainTextEditor({
	content,
	onChange,
	editorFontId,
	editorLineHeight,
	placeholder = "Start writing...",
}: PlainTextEditorProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		textarea.style.height = "auto";
		textarea.style.height = `${Math.max(400, textarea.scrollHeight)}px`;
	}, [content]);

	return (
		<div className="relative">
			<textarea
				ref={textareaRef}
				value={content}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				aria-label="Journal entry"
				className="w-full resize-none bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-foreground/30 md:text-[17px]"
				style={{
					minHeight: "400px",
					fontFamily: editorFontId ? getEditorFontFamily(editorFontId) : undefined,
					lineHeight: editorLineHeight
						? getEditorLineHeightValue(editorLineHeight)
						: undefined,
				}}
				spellCheck
			/>
		</div>
	);
}
