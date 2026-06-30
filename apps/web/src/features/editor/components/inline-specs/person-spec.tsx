"use client";

import { createReactInlineContentSpec } from "@blocknote/react";
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

			// The Person row is the source of truth: renaming it updates every
			// mention. Fall back to the cached name only when the row is missing
			// (deleted person, or a guest/offline read with no people list).
			const resolved = id ? byId.get(id) : undefined;
			const name = normalizeInlinePersonName(resolved?.name ?? cachedName);
			const label = formatInlinePersonLabel(name);
			const dot = resolved?.color ? NOTE_PROPERTY_COLORS[resolved.color].dot : undefined;

			return (
				<span
					contentEditable={false}
					data-note-person
					title={name ? `Person ${name}` : "Person"}
					className={cn(
						"mx-[1px] inline-flex max-w-[18ch] items-center gap-1 overflow-hidden rounded-[4px] border px-1.5 py-0 text-[0.82em] font-medium leading-[1.45] align-baseline",
						"border-primary/30 bg-primary/10 text-primary",
					)}
				>
					<span
						aria-hidden="true"
						className="size-[0.6em] shrink-0 rounded-full"
						style={{ backgroundColor: dot ?? "currentColor" }}
					/>
					<span className="min-w-0 truncate">{label}</span>
				</span>
			);
		},
	},
);
