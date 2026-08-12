"use client";

import { createReactInlineContentSpec } from "@blocknote/react";
import { NoteLinkChip } from "./note-link-chip";

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
		render: ({ inlineContent }) => (
			<NoteLinkChip title={String(inlineContent.props.title ?? "")} />
		),
	},
);
