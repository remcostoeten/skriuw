"use client";

import { createReactInlineContentSpec } from "@blocknote/react";
import { useNotesStore } from "@/features/notes/store";
import { resolveNoteLink, type NoteLink } from "@/features/notes/lib/note-links";
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
    render: ({ inlineContent }) => {
      const title = String(inlineContent.props.title ?? "");
      const { files, activeFileId } = useNoteLinkContext();
      const setActiveFileId = useNotesStore((state) => state.setActiveFileId);

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
        if (!isResolved || !resolved.targetNoteId) {
          return;
        }
        setActiveFileId(resolved.targetNoteId);
        const url = new URL(window.location.href);
        url.searchParams.set("note", resolved.targetNoteId);
        window.history.pushState({}, "", url.toString());
      }

      const tooltip = isResolved
        ? `Open ${title}`
        : resolved.status === "ambiguous"
          ? `Multiple notes match "${title}"`
          : `Unresolved link: ${title}`;

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
            "mx-[1px] inline-flex items-baseline rounded-[3px] px-1 text-[0.95em] font-medium align-baseline transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            isResolved
              ? "bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
              : resolved.status === "ambiguous"
                ? "bg-amber-500/10 text-amber-500 cursor-help"
                : "border border-dashed border-muted-foreground/40 text-muted-foreground cursor-not-allowed",
          )}
        >
          {title || "untitled"}
        </button>
      );
    },
  },
);
