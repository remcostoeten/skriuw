"use client";

import { createReactInlineContentSpec } from "@blocknote/react";
import type { MouseEvent } from "react";
import { cn } from "@/shared/lib/utils";
import { useNotesStore } from "@/features/notes/store";

export const tagInlineSpec = createReactInlineContentSpec(
  {
    type: "tag",
    propSchema: {
      name: { default: "" },
    },
    content: "none",
  },
  {
    toExternalHTML: ({ inlineContent }) => {
      const name = String(inlineContent.props.name ?? "").trim();

      return <span data-note-tag>{name ? `#${name}` : "#"}</span>;
    },
    render: ({ inlineContent }) => {
      const name = String(inlineContent.props.name ?? "");
      const trimmedName = name.trim();
      const setSelectedInspectorTag = useNotesStore((state) => state.setSelectedInspectorTag);
      const setUIState = useNotesStore((state) => state.setUIState);

      function handleClick(event: MouseEvent<HTMLButtonElement>) {
        event.preventDefault();
        event.stopPropagation();
        if (!trimmedName) {
          return;
        }

        setSelectedInspectorTag(trimmedName.replace(/^#/, "").toLowerCase());
        setUIState({ showMetadata: true });
      }

      return (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleClick}
          contentEditable={false}
          data-note-tag
          title={trimmedName ? `Show notes tagged ${trimmedName}` : "Tag"}
          className={cn(
            "mx-[1px] inline-flex cursor-pointer items-baseline rounded-[3px] border px-1 text-[0.95em] font-medium align-baseline transition-colors",
            "border-border bg-popover text-popover-foreground hover:border-ring/70 hover:bg-muted",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40",
          )}
        >
          #{trimmedName}
        </button>
      );
    },
  },
);
