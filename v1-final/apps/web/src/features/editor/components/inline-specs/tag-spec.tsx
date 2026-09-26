"use client";

import { createReactInlineContentSpec } from "@blocknote/react";
import { formatInlineTagLabel, normalizeInlineTagName } from "@/features/editor/lib/inline-tag";
import { TagChip } from "./tag-chip";

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
		render: ({ inlineContent }) => <TagChip name={String(inlineContent.props.name ?? "")} />,
	},
);
