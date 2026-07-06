"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { cn } from "@/shared/lib/utils";
import { useNotesStore } from "@/features/notes/store";
import { formatInlineTagLabel, normalizeInlineTagName } from "@/features/editor/lib/inline-tag";

interface Props {
	name: string;
}

export function TagChip({ name }: Props) {
	const normalizedName = normalizeInlineTagName(name);
	const label = formatInlineTagLabel(normalizedName);
	const setSelectedInspectorTag = useNotesStore((state) => state.setSelectedInspectorTag);
	const setUIState = useNotesStore((state) => state.setUIState);
	const router = useRouter();

	// Click opens the tag's insights page (matching note-link and person
	// Chips); Alt-click keeps the quick in-place metadata filter.
	function handleClick(event: MouseEvent<HTMLButtonElement>) {
		event.preventDefault();
		event.stopPropagation();
		if (!normalizedName) {
			return;
		}

		if (event.altKey) {
			setSelectedInspectorTag(normalizedName);
			setUIState({ showMetadata: true });
			return;
		}

		router.push(`/app/tags/${encodeURIComponent(normalizedName)}`);
	}

	return (
		<button
			type="button"
			onMouseDown={(event) => event.preventDefault()}
			onClick={handleClick}
			contentEditable={false}
			data-note-tag
			aria-label={normalizedName ? `Open tag ${normalizedName}` : "Tag"}
			title={
				normalizedName ? `Open tag ${normalizedName} — Alt-click to filter in place` : "Tag"
			}
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
}
