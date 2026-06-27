"use client";

import { createExtension, defaultProps } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { AnimatedCheckbox } from "./animated-checkbox";

// Build the extension outside the block spec call so we can cast once.
// `createExtension` returns an ExtensionFactoryInstance which is structurally
// compatible with Extension at runtime; the React type overloads are just
// slightly narrower than the vanilla `createBlockSpec` ones.
// biome-ignore lint/suspicious/noExplicitAny: runtime-compatible extension factory
const checkListExtensions: any[] = [
	createExtension({
		key: "check-list-item-shortcuts",
		keyboardShortcuts: {
			Enter: ({ editor }) => {
				const block = editor.getTextCursorPosition().block;
				if (block.type !== "checkListItem") {
					return false;
				}

				// If the current check list item is empty, convert it back
				// to a paragraph (standard list-item Enter behaviour).
				const content = block.content;
				const isEmpty =
					!content ||
					(Array.isArray(content) && content.length === 0) ||
					(Array.isArray(content) &&
						// biome-ignore lint/suspicious/noExplicitAny: inline content union
						content.every((n: any) => typeof n.text === "string" && n.text.length === 0));

				if (isEmpty) {
					editor.updateBlock(block, { type: "paragraph", props: {} });
					return true;
				}
				return false;
			},
			"Mod-Shift-9": ({ editor }) => {
				const cursorPosition = editor.getTextCursorPosition();
				if (
					editor.schema.blockSchema[cursorPosition.block.type].content !== "inline"
				) {
					return false;
				}
				editor.updateBlock(cursorPosition.block, {
					type: "checkListItem",
					props: {},
				});
				return true;
			},
		},
		inputRules: [
			{
				find: /^\s?\[\s*\]\s$/,
				replace() {
					return {
						type: "checkListItem",
						props: { checked: false },
					};
				},
			},
			{
				find: /^\s?\[[Xx]\]\s$/,
				replace() {
					return {
						type: "checkListItem",
						props: { checked: true },
					};
				},
			},
		],
	}),
];

export const createCheckListItem = createReactBlockSpec(
	{
		type: "checkListItem",
		propSchema: {
			...defaultProps,
			checked: {
				default: false,
				type: "boolean" as const,
			},
		},
		content: "inline" as const,
	},
	{
		render: (props) => (
			<div className="flex items-start gap-2 my-0.5 group/checklist">
				<AnimatedCheckbox
					checked={props.block.props.checked}
					onChange={(checked) =>
						props.editor.updateBlock(props.block, {
							type: "checkListItem",
							props: { checked },
						})
					}
				/>
				<div
					ref={props.contentRef}
					className="flex-1 min-w-0 transition-all duration-[360ms]"
					style={{
						textDecoration: props.block.props.checked ? "line-through" : "none",
						opacity: props.block.props.checked ? 0.55 : 1,
					}}
				/>
			</div>
		),
		toExternalHTML: (props) => (
			<li>
				<input type="checkbox" checked={props.block.props.checked} disabled readOnly />
				<div ref={props.contentRef} />
			</li>
		),
	},
	// Register input rules and keyboard shortcuts that the default checkListItem
	// provides but createReactBlockSpec does not inherit automatically.
	checkListExtensions,
);
