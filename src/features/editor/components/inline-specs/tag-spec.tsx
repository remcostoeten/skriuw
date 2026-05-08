"use client";

import { createReactInlineContentSpec } from "@blocknote/react";
import { cn } from "@/shared/lib/utils";

export const tagInlineSpec = createReactInlineContentSpec(
  {
    type: "tag",
    propSchema: {
      name: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ inlineContent }) => {
      const name = String(inlineContent.props.name ?? "");

      return (
        <span
          contentEditable={false}
          data-note-tag
          className={cn(
            "mx-[1px] inline-flex items-baseline rounded-[3px] px-1 text-[0.95em] font-medium align-baseline",
            "bg-accent/40 text-accent-foreground",
          )}
        >
          #{name}
        </span>
      );
    },
  },
);
