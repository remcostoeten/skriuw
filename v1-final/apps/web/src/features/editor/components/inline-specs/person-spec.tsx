"use client";

import { createReactInlineContentSpec } from "@blocknote/react";
import { normalizeInlinePersonName } from "@/features/editor/lib/inline-person";
import { PersonChip } from "./person-chip";

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
		render: ({ inlineContent }) => (
			<PersonChip
				id={String(inlineContent.props.id ?? "")}
				cachedName={String(inlineContent.props.name ?? "")}
			/>
		),
	},
);
