"use client";

import { ArrowUpRight, Link2 } from "lucide-react";
import { useState } from "react";
import {
	getNoteSearchableContent,
	getNoteTitle,
} from "@/domain/notes/note-links";
import {
	linkifyFirstMention,
	type UnlinkedMention,
} from "@/domain/notes/unlinked-mentions";
import { useUpdateNote } from "@/features/notes/hooks/use-update-note";
import { showUserToast } from "@/shared/lib/user-toast";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
import { cn } from "@/shared/lib/utils";
import type { NoteFile } from "@/types/notes";

type Props = {
	mentions: UnlinkedMention[];
	filesById: Map<string, NoteFile>;
	onFileSelect?: (id: string) => void;
};

export function UnlinkedMentionsSection({ mentions, filesById, onFileSelect }: Props) {
	const updateNote = useUpdateNote();
	const [linkingId, setLinkingId] = useState<string | null>(null);

	const handleLink = async (mention: UnlinkedMention) => {
		const note = filesById.get(mention.noteId);
		if (!note) return;

		const base = note.content?.trim() ? note.content : getNoteSearchableContent(note);
		const next = linkifyFirstMention(base, mention.phrase);
		if (!next) {
			showUserToast("Couldn't find the mention to link", "error");
			return;
		}

		setLinkingId(mention.noteId);
		try {
			await updateNote.mutateAsync({ id: note.id, content: next });
			showUserToast("Mention linked", "success");
			triggerNativeFeedback("success");
		} catch {
			triggerNativeFeedback("dismiss");
		} finally {
			setLinkingId((current) => (current === mention.noteId ? null : current));
		}
	};

	return (
		<ul aria-label="Notes that mention this note without a link" className="-mx-2 space-y-0.5">
			{mentions.map((mention) => {
				const note = filesById.get(mention.noteId);
				const title = note ? getNoteTitle(note) : mention.phrase;
				const isLinking = linkingId === mention.noteId;

				return (
					<li
						key={mention.noteId}
						className="group border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-muted"
					>
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={() => onFileSelect?.(mention.noteId)}
								disabled={!onFileSelect}
								aria-label={`Open ${title}`}
								className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left focus-visible:outline-none disabled:cursor-default"
							>
								<span className="min-w-0 flex-1 truncate text-[13px] text-foreground/82">
									{title}
								</span>
								{mention.count > 1 && (
									<span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/50">
										{mention.count}
									</span>
								)}
								<ArrowUpRight
									className="hover-reveal h-3.5 w-3.5 shrink-0 text-muted-foreground"
									strokeWidth={1.5}
								/>
							</button>
							<button
								type="button"
								onClick={() => void handleLink(mention)}
								disabled={isLinking}
								aria-label={`Link mention in ${title}`}
								className={cn(
									"inline-flex min-h-7 shrink-0 cursor-pointer items-center gap-1 border border-border bg-secondary/50 px-2 text-[11px] font-medium text-foreground/78 transition-colors hover:border-ring/70 hover:text-foreground focus-visible:border-ring focus-visible:outline-none disabled:cursor-default disabled:opacity-60",
								)}
							>
								<Link2 className="h-3 w-3 shrink-0" strokeWidth={1.6} />
								{isLinking ? "Linking…" : "Link"}
							</button>
						</div>
						{mention.preview && (
							<p className="mt-1 truncate text-[11px] leading-4 text-muted-foreground/55">
								{mention.preview}
							</p>
						)}
					</li>
				);
			})}
		</ul>
	);
}
