"use client";

import { createReactInlineContentSpec } from "@blocknote/react";
import { type NoteLink } from "@/domain/notes/note-links";
import { useNoteLinkActions } from "@/features/editor/hooks/use-note-link-actions";
import { useNoteLinkContext } from "./note-link-context";
import { cn } from "@/shared/lib/utils";

export const noteLinkInlineSpec = createReactInlineContentSpec(
	{
		type: "noteLink",
		propSchema: {
			title: { default: "" },
		},
		content: "none",
	},
	{
		toExternalHTML: ({ inlineContent }) => {
			const title = String(inlineContent.props.title ?? "").trim();

			return (
				<span data-note-link data-note-link-status="external">
					{title ? `[[${title}]]` : "[[untitled]]"}
				</span>
			);
		},
		render: ({ inlineContent }) => {
			const title = String(inlineContent.props.title ?? "");
			const { activeFileId, resolver } = useNoteLinkContext();
			const { openNote, createAndOpenNote, isCreatingTitle } = useNoteLinkActions();

			const linkInput: NoteLink = {
				raw: `[[${title}]]`,
				kind: "wiki",
				sourceNoteId: activeFileId ?? "",
				targetLabel: title,
			};
			const resolved = resolver.resolve(linkInput);
			const isResolved = resolved.status === "resolved" && Boolean(resolved.targetNoteId);
			const isCreating = isCreatingTitle(title);

			function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
				event.preventDefault();
				event.stopPropagation();

				if (isCreating) {
					return;
				}

				if (isResolved && resolved.targetNoteId) {
					openNote(resolved.targetNoteId);
					return;
				}

				// Ambiguous: more than one note shares this title. Open the first
				// match so the link stays navigable instead of being a dead button
				// (and so we never create a further duplicate).
				if (resolved.status === "ambiguous") {
					const match = resolver.findFirstByTitle(title);
					if (match) openNote(match.id);
					return;
				}

				if (resolved.status === "unresolved") {
					createAndOpenNote(title);
				}
			}

			const tooltip = isResolved
				? `Open ${title}`
				: resolved.status === "ambiguous"
					? `Open ${title} (multiple notes match)`
					: isCreating
						? `Creating "${title}"…`
						: `Create note "${title}"`;

			return (
				<button
					type="button"
					onMouseDown={(event) => event.preventDefault()}
					onClick={handleClick}
					disabled={isCreating}
					contentEditable={false}
					data-note-link
					data-note-link-status={resolved.status}
					title={tooltip}
					className={cn(
						"mx-[1px] inline-flex items-baseline rounded-[3px] border px-1 text-[0.95em] font-medium align-baseline transition-colors",
						"border-border bg-popover text-popover-foreground",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40",
						isCreating && "cursor-wait opacity-70",
						isResolved
							? "underline decoration-foreground/50 decoration-1 underline-offset-[3px] hover:bg-foreground/[0.08] hover:decoration-foreground cursor-pointer"
							: resolved.status === "ambiguous"
								? "text-warning underline decoration-warning/60 decoration-1 underline-offset-[3px] hover:bg-warning/10 cursor-pointer"
								: "text-primary underline decoration-primary/40 decoration-dashed decoration-1 underline-offset-[3px] hover:bg-primary/10 hover:decoration-primary/70 cursor-pointer",
					)}
				>
					{title || "untitled"}
				</button>
			);
		},
	},
);
