"use client";

import { defaultProps } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import {
	DiagramBlockView,
	getDiagramSource,
	type DiagramBlockData,
	type DiagramEditor,
} from "./diagram-view";
import { DEFAULT_DIAGRAM_SOURCE, normalizeDiagramSource } from "@/shared/lib/diagram";

export const createDiagram = createReactBlockSpec(
	{
		type: "diagram",
		propSchema: {
			...defaultProps,
			source: {
				default: DEFAULT_DIAGRAM_SOURCE,
			},
		},
		content: "none" as const,
	},
	{
		render: (props) => (
			<DiagramBlockView
				block={props.block as DiagramBlockData}
				editor={props.editor as DiagramEditor}
			/>
		),
		toExternalHTML: (props) => (
			<pre data-skriuw-diagram="true">
				<code className="language-mermaid">
					{getDiagramSource(props.block as DiagramBlockData)}
				</code>
			</pre>
		),
		parse: (element) => {
			if (!element.hasAttribute("data-skriuw-diagram")) {
				return undefined;
			}
			const source = normalizeDiagramSource(element.textContent ?? "");
			return source ? { source } : undefined;
		},
		runsBefore: ["fileTree"],
		meta: {
			isolating: true,
		},
	},
);
