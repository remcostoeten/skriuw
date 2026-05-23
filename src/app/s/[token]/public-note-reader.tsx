"use client";

import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { Editor } from "@/features/editor/components/editor";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import { stripMarkdownExtension } from "@/domain/notes/note-links";
import type { TPublicShareSnapshot } from "@/domain/sharing/models";
import type { NoteFile } from "@/types/notes";

/** Renders a frozen share snapshot in the app's read-only editor. */
export function PublicNoteReader({ snapshot }: { snapshot: TPublicShareSnapshot }) {
	const file = useMemo<NoteFile>(() => {
		const sharedAt = new Date(snapshot.sharedAt);
		return {
			id: "public-share",
			name: snapshot.name,
			content: snapshot.content,
			richContent: snapshot.richContent ?? markdownToRichDocument(snapshot.content),
			preferredEditorMode: snapshot.preferredEditorMode,
			createdAt: sharedAt,
			modifiedAt: sharedAt,
			parentId: null,
			tags: [],
		};
	}, [snapshot]);

	const title = stripMarkdownExtension(snapshot.name).replace(/-/g, " ") || "Untitled";

	return (
		<main className="flex min-h-dvh flex-col bg-background text-foreground">
			<header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur sm:px-6">
				<span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground/85">
					{title}
				</span>
				<span className="shrink-0 text-[11px] text-muted-foreground/70">
					Shared {formatDistanceToNow(new Date(snapshot.sharedAt), { addSuffix: true })}
				</span>
			</header>

			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
				<div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-2 py-4 sm:px-6">
					{snapshot.author && (
						<p className="px-2 pb-1 text-[12px] text-muted-foreground sm:px-0">
							by{" "}
							<span className="font-medium text-foreground/80">{snapshot.author}</span>
						</p>
					)}
					<Editor
						file={file}
						files={[]}
						editorMode={snapshot.preferredEditorMode}
						editorFontId="inter"
						editorLineHeight="comfortable"
						readOnly
						onContentChange={() => {}}
					/>
				</div>
			</div>

			<footer className="border-t border-border px-6 py-3 text-center text-[11px] text-muted-foreground/70">
				Shared with{" "}
				<Link
					href="/"
					className="font-medium text-foreground/80 transition-colors hover:text-foreground"
				>
					Skriuw
				</Link>
			</footer>
		</main>
	);
}
