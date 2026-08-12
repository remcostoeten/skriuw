"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Check, Code, Copy, Workflow, X } from "lucide-react";
import {
	DEFAULT_DIAGRAM_SOURCE,
	normalizeDiagramSource,
	renderDiagram,
} from "@/shared/lib/diagram";
import {
	DEFAULT_DIAGRAM_GRAPH,
	parseGraph,
	serializeGraph,
	type DiagramGraph,
} from "@/features/diagram/graph";
import type { DiagramState } from "@/features/diagram/diagram-builder";
import { cn } from "@/shared/lib/utils";

const DiagramBuilder = lazy(() =>
	import("@/features/diagram/diagram-builder").then((mod) => ({ default: mod.DiagramBuilder })),
);

export interface DiagramBlockData {
	props: {
		source?: string;
		graph?: string;
	};
}

export interface DiagramEditor {
	isEditable?: boolean;
	updateBlock: (
		block: unknown,
		update: { type: "diagram"; props: { source?: string; graph?: string } },
	) => void;
}

function getDiagramSource(block: DiagramBlockData): string {
	const source = block.props.source?.trim();
	return source ? normalizeDiagramSource(source) : DEFAULT_DIAGRAM_SOURCE;
}

const HEADER_ICON_BUTTON =
	"flex h-6 w-6 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-foreground/8 hover:text-foreground";

export function DiagramBlockView({
	block,
	editor,
}: {
	block: DiagramBlockData;
	editor: DiagramEditor;
}) {
	const source = getDiagramSource(block);
	const [editing, setEditing] = useState(false);
	const [building, setBuilding] = useState(false);
	const [draftSource, setDraftSource] = useState(source);
	const [copied, setCopied] = useState(false);
	const [svg, setSvg] = useState<string | null>(null);
	const [renderError, setRenderError] = useState<string | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

	useEffect(() => {
		let cancelled = false;
		void renderDiagram(source).then((result) => {
			if (cancelled) {
				return;
			}
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

	useEffect(() => {
		if (!editing) {
			return;
		}
		textareaRef.current?.focus();
	}, [editing]);

	function saveDraft() {
		const nextSource = normalizeDiagramSource(draftSource);
		if (!nextSource) {
			return;
		}
		editor.updateBlock(block, {
			props: { source: nextSource },
			type: "diagram",
		});
		setEditing(false);
	}

	function initialGraph(): DiagramGraph {
		return parseGraph(block.props.graph) ?? DEFAULT_DIAGRAM_GRAPH;
	}

	function saveFromBuilder(state: DiagramState) {
		const nextSource = normalizeDiagramSource(state.code);
		editor.updateBlock(block, {
			type: "diagram",
			props: {
				source: nextSource || source,
				graph: serializeGraph({
					nodes: state.nodes,
					edges: state.edges,
					direction: state.direction,
				}),
			},
		});
		setBuilding(false);
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
			className="group/diagram relative my-1 w-full overflow-hidden"
		>
			<div
				className={cn(
					"absolute right-1.5 top-1.5 z-10 flex items-center gap-0.5 rounded-md bg-background/70 p-0.5 backdrop-blur-sm",
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
								onMouseDown={(event) => event.preventDefault()}
								onClick={saveDraft}
							>
								<Check className="h-3.5 w-3.5" strokeWidth={1.8} />
							</button>
							<button
								type="button"
								className={HEADER_ICON_BUTTON}
								aria-label="Cancel edit"
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
						<>
							<button
								type="button"
								className={HEADER_ICON_BUTTON}
								aria-label="Edit diagram visually"
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => setBuilding(true)}
							>
								<Workflow className="h-3.5 w-3.5" strokeWidth={1.8} />
							</button>
							<button
								type="button"
								className={HEADER_ICON_BUTTON}
								aria-label="Edit diagram source"
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => {
									setDraftSource(source);
									setEditing(true);
								}}
							>
								<Code className="h-3.5 w-3.5" strokeWidth={1.8} />
							</button>
						</>
					)
				) : null}
				<button
					type="button"
					className={HEADER_ICON_BUTTON}
					aria-label={copied ? "Copied" : "Copy diagram source"}
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

			{editing ? (
				<textarea
					ref={textareaRef}
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
									// Biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid output under securityLevel strict
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
							// Biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid output under securityLevel strict
							dangerouslySetInnerHTML={{ __html: svg }}
						/>
					) : (
						<p className="py-2 text-xs italic text-muted-foreground/60">
							Rendering diagram…
						</p>
					)}
				</div>
			)}

			{building ? (
				<Suspense fallback={null}>
					<DiagramBuilder
						onClose={() => setBuilding(false)}
						onInsert={saveFromBuilder}
						initialNodes={initialGraph().nodes}
						initialEdges={initialGraph().edges}
						initialDirection={initialGraph().direction}
					/>
				</Suspense>
			) : null}
		</section>
	);
}
