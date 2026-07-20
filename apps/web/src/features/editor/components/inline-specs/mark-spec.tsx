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
			thread: { default: "" },
		},
		content: "none",
	},
	{
		toExternalHTML: ({ inlineContent }) => {
			const kind = isMarkKind(inlineContent.props.kind)
				? inlineContent.props.kind
				: "reference";
			return (
				<span
					data-skriuw-mark={kind}
					data-skriuw-mark-id={String(inlineContent.props.id ?? "")}
					data-skriuw-mark-value={String(inlineContent.props.value ?? "")}
					data-skriuw-mark-color={String(inlineContent.props.color ?? "yellow")}
					data-skriuw-mark-label={String(inlineContent.props.label ?? "")}
					data-skriuw-mark-thread={String(inlineContent.props.thread ?? "")}
				>
					{String(inlineContent.props.text ?? "")}
				</span>
			);
		},
		render: ({ inlineContent, updateInlineContent }) => {
			const kind = isMarkKind(inlineContent.props.kind)
				? inlineContent.props.kind
				: "reference";
			return (
				<MarkChip
					id={String(inlineContent.props.id ?? "")}
					kind={kind}
					color={inlineContent.props.color}
					label={String(inlineContent.props.label ?? "")}
					thread={String(inlineContent.props.thread ?? "")}
					text={String(inlineContent.props.text ?? "")}
					onUpdate={(update) =>
						updateInlineContent({
							type: "mark",
							props: { ...inlineContent.props, ...update },
						})
					}
					onUnmark={() =>
						updateInlineContent(String(inlineContent.props.text ?? "") as never)
					}
				/>
			);
		},
	},
);
