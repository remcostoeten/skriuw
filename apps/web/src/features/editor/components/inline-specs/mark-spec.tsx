"use client";

import { createReactInlineContentSpec } from "@blocknote/react";
import { isMarkKind } from "@skriuw/domain/living-information";
import { MarkChip } from "./mark-chip";

export const markInlineSpec = createReactInlineContentSpec(
	{
		type: "mark",
		propSchema: {
			id: { default: "" },
			kind: { default: "reference" },
			text: { default: "" },
			value: { default: "" },
			color: { default: "yellow" },
			label: { default: "" },
		},
		content: "none",
	},
	{
		toExternalHTML: ({ inlineContent }) => {
			const kind = isMarkKind(inlineContent.props.kind)
				? inlineContent.props.kind
				: "reference";
			return <span data-skriuw-mark={kind}>{String(inlineContent.props.text ?? "")}</span>;
		},
		render: ({ inlineContent }) => {
			const kind = isMarkKind(inlineContent.props.kind)
				? inlineContent.props.kind
				: "reference";
			return (
				<MarkChip
					kind={kind}
					color={inlineContent.props.color}
					label={String(inlineContent.props.label ?? "")}
					text={String(inlineContent.props.text ?? "")}
				/>
			);
		},
	},
);
