"use client";

import { createReactInlineContentSpec } from "@blocknote/react";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { NOTE_PROPERTY_COLORS } from "@/domain/notes/properties";
import { cn } from "@/shared/lib/utils";
import { formatInlinePersonLabel, normalizeInlinePersonName } from "@/features/editor/lib/inline-person";
import { usePeopleContext } from "./people-context";

export const personInlineSpec = createReactInlineContentSpec(
	{
		type: "person",
		propSchema: {
			id: { default: "" },
			name: { default: "" },
		},
		content: "none",
	},
	{
		toExternalHTML: ({ inlineContent }) => {
			const name = normalizeInlinePersonName(String(inlineContent.props.name ?? ""));

			return <span data-note-person>{name ? `$${name}` : "$"}</span>;
		},
		render: ({ inlineContent }) => {
			const id = String(inlineContent.props.id ?? "");
			const cachedName = String(inlineContent.props.name ?? "");
			const { byId } = usePeopleContext();
			const router = useRouter();

			// The Person row is the source of truth: renaming it updates every
			// mention. Fall back to the cached name only when the row is missing
			// (deleted person, or a guest/offline read with no people list).
			const resolved = id ? byId.get(id) : undefined;
			const name = normalizeInlinePersonName(resolved?.name ?? cachedName);
			const label = formatInlinePersonLabel(name);
			const dot = resolved?.color ? NOTE_PROPERTY_COLORS[resolved.color].dot : undefined;

			function handleClick(event: MouseEvent<HTMLButtonElement>) {
				event.preventDefault();
				event.stopPropagation();
				if (!id) return;
				router.push(`/app/people/${id}`);
			}

			return (
				<button
					type="button"
					onMouseDown={(event) => event.preventDefault()}
					onClick={handleClick}
					contentEditable={false}
					data-note-person
					aria-label={name ? `Open person ${name}` : "Person"}
					title={name ? `Open person ${name}` : "Person"}
					className={cn(
						"mx-[1px] inline-flex max-w-[18ch] cursor-pointer items-center gap-1 overflow-hidden rounded-[4px] border px-1.5 py-0 text-[0.82em] font-medium leading-[1.45] align-baseline transition-colors",
						"border-primary/30 bg-primary/10 text-primary hover:border-primary/60 hover:bg-primary/20",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40",
					)}
				>
					<span
						aria-hidden="true"
						className="size-[0.6em] shrink-0 rounded-full"
						style={{ backgroundColor: dot ?? "currentColor" }}
					/>
					<span className="min-w-0 truncate">{label}</span>
				</button>
			);
		},
	},
);
