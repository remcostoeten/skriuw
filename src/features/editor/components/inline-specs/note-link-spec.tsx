"use client";

import { createReactInlineContentSpec } from "@blocknote/react";
import { useNotesStore } from "@/features/notes/store";
import { resolveNoteLink, type NoteLink } from "@/features/notes/lib/note-links";
import { useCreateNote } from "@/features/notes/hooks/use-create-note";
import { cn } from "@/shared/lib/utils";
import { useNoteLinkContext } from "./note-link-context";

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
      const { files, activeFileId } = useNoteLinkContext();
      const setActiveFileId = useNotesStore((state) => state.setActiveFileId);
      const createNote = useCreateNote();

      const linkInput: NoteLink = {
        raw: `[[${title}]]`,
        kind: "wiki",
        sourceNoteId: activeFileId ?? "",
        targetLabel: title,
      };
      const resolved = resolveNoteLink(linkInput, files);
      const isResolved = resolved.status === "resolved" && Boolean(resolved.targetNoteId);

      function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
        event.preventDefault();
        event.stopPropagation();
        if (isResolved && resolved.targetNoteId) {
          setActiveFileId(resolved.targetNoteId);
          const url = new URL(window.location.href);
          url.searchParams.set("note", resolved.targetNoteId);
          window.history.pushState({}, "", url.toString());
          return;
        }

        if (resolved.status === "unresolved") {
          createNote.mutate({
            name: title,
            content: `# ${title}\n\n`,
          });
        }
      }

      const tooltip = isResolved
        ? `Open ${title}`
        : resolved.status === "ambiguous"
          ? `Multiple notes match "${title}"`
          : `Create note "${title}"`;

      return (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleClick}
          contentEditable={false}
          data-note-link
          data-note-link-status={resolved.status}
          title={tooltip}
          className={cn(
            "mx-[1px] inline-flex items-baseline rounded-[3px] border px-1 text-[0.95em] font-medium align-baseline transition-colors",
            "border-border bg-popover text-popover-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40",
            isResolved
              ? "underline decoration-foreground/50 decoration-1 underline-offset-[3px] hover:bg-foreground/[0.08] hover:decoration-foreground cursor-pointer"
              : resolved.status === "ambiguous"
                ? "text-amber-400 underline decoration-amber-400/60 decoration-1 underline-offset-[3px] cursor-help"
                : "text-primary underline decoration-primary/40 decoration-dashed decoration-1 underline-offset-[3px] hover:bg-primary/10 hover:decoration-primary/70 cursor-pointer",
          )}
        >
          {title || "untitled"}
        </button>
      );
    },
  },
);
