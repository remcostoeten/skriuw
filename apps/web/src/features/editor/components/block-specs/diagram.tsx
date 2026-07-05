"use client";

import { useEffect, useState } from "react";
import { defaultProps } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { Check, Copy, PencilLine, Workflow, X } from "lucide-react";
import {
	DEFAULT_DIAGRAM_SOURCE,
	normalizeDiagramSource,
	renderDiagram,
} from "@/shared/lib/diagram";
import { cn } from "@/shared/lib/utils";

type DiagramBlockData = {
	props: {
		source?: string;
	};
};

type DiagramEditor = {
	isEditable?: boolean;
	updateBlock: (block: unknown, update: { type: "diagram"; props: { source: string } }) => void;
};

function getDiagramSource(block: DiagramBlockData): string {
	const source = block.props.source?.trim();
	return source ? normalizeDiagramSource(source) : DEFAULT_DIAGRAM_SOURCE;
}

const HEADER_ICON_BUTTON =
	"flex h-6 w-6 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-foreground/8 hover:text-foreground";

function DiagramBlockView({ block, editor }: { block: DiagramBlockData; editor: DiagramEditor }) {
	const source = getDiagramSource(block);
	const [editing, setEditing] = useState(false);
	const [draftSource, setDraftSource] = useState(source);
	const [copied, setCopied] = useState(false);
	const [svg, setSvg] = useState<string | null>(null);
	const [renderError, setRenderError] = useState<string | null>(null);

	useEffect(() => {
		setDraftSource(source);
	}, [source]);

	useEffect(() => {
		let cancelled = false;
		void renderDiagram(source).then((result) => {
			if (cancelled) return;
			if (result.ok) {
				setSvg(result.svg);
				setRenderError(null);
			} else {
				setRenderError(result.error);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [source]);

	function saveDraft() {
		const nextSource = normalizeDiagramSource(draftSource);
		if (!nextSource) return;
		editor.updateBlock(block, {
			type: "diagram",
			props: { source: nextSource },
		});
		setEditing(false);
	}

	async function copySource() {
		try {
			await navigator.clipboard.writeText(source);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1200);
		} catch {
			setCopied(false);
		}
	}

	return (
		<section
			contentEditable={false}
			className="group/diagram my-1 w-full overflow-hidden rounded-md border border-border/60 bg-muted/25"
		>
			<header className="flex h-9 items-center gap-2 border-b border-border/40 bg-muted/30 pl-3 pr-1.5">
				<Workflow
					className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70"
					strokeWidth={1.7}
					aria-hidden
				/>
				<p className="truncate text-xs font-medium tracking-tight text-foreground">
					Diagram
				</p>
				<p className="shrink-0 text-[10px] text-muted-foreground/60">mermaid</p>

				<div
					className={cn(
						"ml-auto flex items-center gap-0.5",
						"opacity-0 transition-opacity group-hover/diagram:opacity-100 focus-within:opacity-100",
						editing && "opacity-100",
					)}
				>
					{editor.isEditable ? (
						editing ? (
							<>
								<button
									type="button"
									className={HEADER_ICON_BUTTON}
									aria-label="Save diagram"
									title="Save (⌘↩)"
									onMouseDown={(event) => event.preventDefault()}
									onClick={saveDraft}
								>
									<Check className="h-3.5 w-3.5" strokeWidth={1.8} />
								</button>
								<button
									type="button"
									className={HEADER_ICON_BUTTON}
									aria-label="Cancel edit"
									title="Cancel (Esc)"
									onMouseDown={(event) => event.preventDefault()}
									onClick={() => {
										setDraftSource(source);
										setEditing(false);
									}}
								>
									<X className="h-3.5 w-3.5" strokeWidth={1.8} />
								</button>
							</>
						) : (
							<button
								type="button"
								className={HEADER_ICON_BUTTON}
								aria-label="Edit diagram"
								title="Edit"
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => setEditing(true)}
							>
								<PencilLine className="h-3.5 w-3.5" strokeWidth={1.8} />
							</button>
						)
					) : null}
					<button
						type="button"
						className={HEADER_ICON_BUTTON}
						aria-label={copied ? "Copied" : "Copy diagram source"}
						title={copied ? "Copied" : "Copy"}
						onMouseDown={(event) => event.preventDefault()}
						onClick={copySource}
					>
						{copied ? (
							<Check className="h-3.5 w-3.5 text-success" strokeWidth={1.8} />
						) : (
							<Copy className="h-3.5 w-3.5" strokeWidth={1.8} />
						)}
					</button>
				</div>
			</header>

			{editing ? (
				<textarea
					autoFocus
					spellCheck={false}
					value={draftSource}
					onChange={(event) => setDraftSource(event.target.value)}
					onKeyDown={(event) => {
						if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
							event.preventDefault();
							saveDraft();
						}
						if (event.key === "Escape") {
							event.preventDefault();
							setDraftSource(source);
							setEditing(false);
						}
					}}
					className={cn(
						"block w-full resize-y bg-transparent px-3 py-2.5 font-mono text-base leading-relaxed md:text-xs",
						"text-foreground/90 outline-none placeholder:text-muted-foreground/40",
						"min-h-[160px]",
					)}
					placeholder={"flowchart TD\n    A --> B"}
				/>
			) : (
				<div className="px-3 py-3">
					{renderError ? (
						<div>
							{svg ? (
								<div
									className="flex justify-center opacity-50 [&_svg]:h-auto [&_svg]:max-w-full"
									// biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid output under securityLevel strict
									dangerouslySetInnerHTML={{ __html: svg }}
								/>
							) : null}
							<p className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-destructive/90">
								{renderError}
							</p>
						</div>
					) : svg ? (
						<div
							className="flex justify-center [&_svg]:h-auto [&_svg]:max-w-full"
							// biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid output under securityLevel strict
							dangerouslySetInnerHTML={{ __html: svg }}
						/>
					) : (
						<p className="py-2 text-xs italic text-muted-foreground/60">
							Rendering diagram…
						</p>
					)}
				</div>
			)}
		</section>
	);
}

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
