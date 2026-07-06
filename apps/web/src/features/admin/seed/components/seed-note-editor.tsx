"use client";

import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";
import { editorSchema } from "@/features/editor/components/inline-specs/schema";
import { NoteLinkProvider } from "@/features/editor/components/inline-specs/note-link-context";
import { useSeedEditorStore } from "../store";
import type { SeedNote } from "@/domain/seed/types";

type Props = {
	note: SeedNote;
};

export function SeedNoteEditor({ note }: Props) {
	const updateNoteContent = useSeedEditorStore((s) => s.updateNoteContent);

	// biome-ignore lint/suspicious/noExplicitAny: editor type with custom schema requires deep inference
	const editor = useCreateBlockNote({
		schema: editorSchema,
		// biome-ignore lint/suspicious/noExplicitAny: same
		initialContent: note.richContent?.length ? (note.richContent as any) : undefined,
	});

	return (
		<NoteLinkProvider files={[]}>
			<div className="flex flex-col h-full">
				<div className="px-6 py-3 border-b border-border/40">
					<h2 className="text-sm font-medium text-foreground">{note.name}</h2>
					<p className="text-xs text-muted-foreground/60 mt-0.5">
						Double-click a name in the tree to rename
					</p>
				</div>
				<div className="flex-1 overflow-y-auto">
					<BlockNoteView
						editor={editor}
						onChange={() => {
							updateNoteContent(note.ref, editor.document as unknown[]);
						}}
						theme="dark"
						className="min-h-full px-4"
					/>
				</div>
			</div>
		</NoteLinkProvider>
	);
}
