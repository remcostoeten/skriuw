"use client";

import { createReactInlineContentSpec } from "@blocknote/react";
import type { MouseEvent } from "react";
import { cn } from "@/shared/lib/utils";
import { useNotesStore } from "@/features/notes/store";
import { formatInlineTagLabel, normalizeInlineTagName } from "@/features/editor/lib/inline-tag";

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
			const name = normalizeInlineTagName(String(inlineContent.props.name ?? ""));

			return <span data-note-tag>{formatInlineTagLabel(name)}</span>;
		},
		render: ({ inlineContent }) => {
			const name = String(inlineContent.props.name ?? "");
			const normalizedName = normalizeInlineTagName(name);
			const label = formatInlineTagLabel(normalizedName);
			const setSelectedInspectorTag = useNotesStore((state) => state.setSelectedInspectorTag);
			const setUIState = useNotesStore((state) => state.setUIState);

			function handleClick(event: MouseEvent<HTMLButtonElement>) {
				event.preventDefault();
				event.stopPropagation();
				if (!normalizedName) {
					return;
				}

				setSelectedInspectorTag(normalizedName);
				setUIState({ showMetadata: true });
			}

			return (
				<button
					type="button"
					onMouseDown={(event) => event.preventDefault()}
					onClick={handleClick}
					contentEditable={false}
					data-note-tag
					aria-label={normalizedName ? `Show notes tagged ${normalizedName}` : "Tag"}
					title={normalizedName ? `Show notes tagged ${normalizedName}` : "Tag"}
					className={cn(
						"mx-[1px] inline-flex max-w-[16ch] cursor-pointer items-center gap-0.5 overflow-hidden rounded-[4px] border px-1.5 py-0 text-[0.82em] font-medium leading-[1.45] align-baseline transition-colors",
						"border-border/80 bg-muted/60 text-foreground/82 hover:border-ring/70 hover:bg-muted hover:text-foreground",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40",
					)}
				>
					<span aria-hidden="true" className="shrink-0 text-muted-foreground/72">
						#
					</span>
					<span className="min-w-0 truncate">{label.replace(/^#/, "")}</span>
				</button>
			);
		},
	},
);
