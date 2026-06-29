"use client";

import { createReactInlineContentSpec } from "@blocknote/react";
import { cn } from "@/shared/lib/utils";
import { formatInlineUserLabel, normalizeInlineUserName } from "@/features/editor/lib/inline-user";

export const userInlineSpec = createReactInlineContentSpec(
	{
		type: "user",
		propSchema: {
			name: { default: "" },
		},
		content: "none",
	},
	{
		toExternalHTML: ({ inlineContent }) => {
			const name = normalizeInlineUserName(String(inlineContent.props.name ?? ""));

			return <span data-note-user>{formatInlineUserLabel(name)}</span>;
		},
		render: ({ inlineContent }) => {
			const name = String(inlineContent.props.name ?? "");
			const normalizedName = normalizeInlineUserName(name);
			const label = formatInlineUserLabel(normalizedName);

			return (
				<span
					contentEditable={false}
					data-note-user
					title={normalizedName ? `User ${normalizedName}` : "User"}
					className={cn(
						"mx-[1px] inline-flex max-w-[16ch] items-center gap-0.5 overflow-hidden rounded-[4px] border px-1.5 py-0 text-[0.82em] font-medium leading-[1.45] align-baseline",
						"border-primary/30 bg-primary/10 text-primary",
					)}
				>
					<span aria-hidden="true" className="shrink-0 text-primary/70">
						$
					</span>
					<span className="min-w-0 truncate">{label.replace(/^\$/, "")}</span>
				</span>
			);
		},
	},
);
