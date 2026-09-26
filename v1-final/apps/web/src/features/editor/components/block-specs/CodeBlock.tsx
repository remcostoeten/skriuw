import { createExtension } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import {
	CodeBlockView,
	LANGUAGE_VALUES,
	type CodeBlockData,
	type CodeBlockEditor,
} from "./code-block-view";
import "./code-block.css";

const validLanguages = new Set(LANGUAGE_VALUES);

// oxlint-disable-next-line no-explicit-any -- runtime-compatible extension factory
const procodeExtensions: any[] = [
	createExtension({
		key: "procode-input-rule",
		inputRules: [
			{
				find: /^```(\S+)?(\s+.*)?\s$/,
				replace: ({ match }: { match: RegExpMatchArray }) => {
					const raw = match[1]?.toLowerCase();
					const language = raw && validLanguages.has(raw) ? raw : "typescript";
					const title =
						raw && !validLanguages.has(raw)
							? ((match[1] ?? "") + (match[2] ?? "")).trim()
							: (match[2] ?? "").trim();
					return { type: "procode", props: { language, title } };
				},
			},
		],
	}),
];

export const CodeBlock = createReactBlockSpec(
	{
		type: "procode",
		propSchema: {
			language: { default: "typescript" as string, values: LANGUAGE_VALUES },
			title: { default: "" },
		},
		content: "inline",
	},
	{
		render: (props) => (
			<CodeBlockView
				block={props.block as CodeBlockData}
				contentRef={props.contentRef}
				editor={props.editor as unknown as CodeBlockEditor}
			/>
		),
		toExternalHTML: ({ block, contentRef }) => (
			<pre>
				<code
					className={`language-${block.props.language}`}
					data-language={block.props.language}
					ref={contentRef}
				/>
			</pre>
		),
	},
	procodeExtensions,
);
