import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
	addEdge,
	Background,
	BackgroundVariant,
	type Connection,
	Controls,
	type Edge,
	type EdgeMouseHandler,
	type Node,
	type OnEdgesChange,
	type OnNodesChange,
	ReactFlow,
	ReactFlowProvider,
	useEdgesState,
	useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AnimatePresence, domAnimation, LazyMotion, m } from "framer-motion";
import {
	ArrowLeft,
	Check,
	ChevronDown,
	ChevronUp,
	Circle,
	Code2,
	Copy,
	Database,
	Diamond,
	Eye,
	FileText,
	Hexagon,
	Layers,
	MousePointer2,
	Plus,
	Sparkles,
	LoaderCircle,
	Redo2,
	Square,
	Undo2,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { showUserToast } from "@/shared/lib/user-toast";
import { DiagramContext } from "./diagram-context";
import { defaultEdges, defaultNodes } from "./default-diagram";
import { cloneDiagramPreset, DIAGRAM_PRESETS, getDiagramPreset } from "./diagram-presets";
import { generateMermaid } from "./mermaid-utils";
import { MermaidPreview } from "./mermaid-preview";
import { nodeTypes } from "./node-types";
import type { NodeData } from "./nodes";
import { useDiagramAi } from "./use-diagram-ai";

type DiagramNodeData = NodeData;
type DiagramNode = Node<DiagramNodeData>;
type DiagramSnapshot = { nodes: DiagramNode[]; edges: Edge[]; direction: string };

const PALETTE: {
	section: string;
	items: { type: string; label: string; icon: ReactNode; hint: string }[];
}[] = [
	{
		section: "Basic",
		items: [
			{
				type: "process",
				label: "Process",
				icon: <Square className="w-3.5 h-3.5 text-primary" />,
				hint: "A step or action",
			},
			{
				type: "decision",
				label: "Decision",
				icon: <Diamond className="w-3.5 h-3.5 text-primary" />,
				hint: "Branch on condition",
			},
			{
				type: "terminal",
				label: "Start / End",
				icon: <div className="w-3.5 h-2.5 border-2 border-primary rounded-full" />,
				hint: "Begin or finish",
			},
			{
				type: "circle",
				label: "Circle",
				icon: <Circle className="w-3.5 h-3.5 text-primary" />,
				hint: "Connector / event",
			},
		],
	},
	{
		section: "Advanced",
		items: [
			{
				type: "data",
				label: "I/O",
				icon: <Layers className="w-3.5 h-3.5 text-primary" />,
				hint: "Input or output data",
			},
			{
				type: "cylinder",
				label: "Cylinder",
				icon: <Database className="w-3.5 h-3.5 text-primary" />,
				hint: "Storage / database",
			},
			{
				type: "hexagon",
				label: "Hexagon",
				icon: <Hexagon className="w-3.5 h-3.5 text-primary" />,
				hint: "Preparation step",
			},
			{
				type: "subroutine",
				label: "Subroutine",
				icon: <Code2 className="w-3.5 h-3.5 text-primary" />,
				hint: "Predefined process",
			},
			{
				type: "note",
				label: "Note",
				icon: <FileText className="w-3.5 h-3.5 text-primary" />,
				hint: "Annotation",
			},
		],
	},
];

const BORDER_COLORS = [
	{ value: "", bg: "#333", label: "Default" },
	{ value: "#3b82f6", bg: "#3b82f6", label: "Blue" },
	{ value: "#10b981", bg: "#10b981", label: "Green" },
	{ value: "#ef4444", bg: "#ef4444", label: "Red" },
	{ value: "#f59e0b", bg: "#f59e0b", label: "Amber" },
	{ value: "#8b5cf6", bg: "#8b5cf6", label: "Purple" },
	{ value: "#ec4899", bg: "#ec4899", label: "Pink" },
];

const FILL_COLORS = [
	{ value: "", bg: "#171717", label: "Default" },
	{ value: "#1e3a5f", bg: "#1e3a5f", label: "Navy" },
	{ value: "#14532d", bg: "#14532d", label: "Forest" },
	{ value: "#450a0a", bg: "#450a0a", label: "Crimson" },
	{ value: "#451a03", bg: "#451a03", label: "Amber" },
	{ value: "#3b0764", bg: "#3b0764", label: "Violet" },
	{ value: "#134e4a", bg: "#134e4a", label: "Teal" },
	{ value: "#1e1b4b", bg: "#1e1b4b", label: "Indigo" },
];

const EDGE_COLORS = [
	{ value: "", bg: "#555", label: "Default" },
	{ value: "#3b82f6", bg: "#3b82f6", label: "Blue" },
	{ value: "#10b981", bg: "#10b981", label: "Green" },
	{ value: "#ef4444", bg: "#ef4444", label: "Red" },
	{ value: "#f59e0b", bg: "#f59e0b", label: "Amber" },
	{ value: "#8b5cf6", bg: "#8b5cf6", label: "Purple" },
];

function onDragStart(event: React.DragEvent, type: string, label: string) {
	event.dataTransfer.setData("application/reactflow", type);
	event.dataTransfer.setData("application/label", label);
	event.dataTransfer.effectAllowed = "move";
}

function SwatchRow({
	colors,
	value,
	onChange,
}: {
	colors: { value: string; bg: string; label: string }[];
	value: string | undefined;
	onChange: (v: string) => void;
}) {
	return (
		<div className="flex flex-wrap gap-1.5">
			{colors.map((c) => (
				<button
					type="button"
					key={c.label}
					aria-label={c.label}
					onClick={() => onChange(c.value)}
					className={`w-5 h-5 rounded-none border-2 transition-all ${(value ?? "") === c.value ? "border-foreground scale-110" : "border-transparent hover:border-foreground/40"}`}
					style={{ backgroundColor: c.bg }}
				/>
			))}
		</div>
	);
}

function EdgeLabelEditor({
	edge,
	position,
	onCommit,
	onCancel,
}: {
	edge: Edge;
	position: { x: number; y: number };
	onCommit: (id: string, label: string) => void;
	onCancel: () => void;
}) {
	const [value, setValue] = useState((edge.label as string) ?? "");
	const ref = useRef<HTMLInputElement>(null);
	useEffect(() => {
		ref.current?.focus();
		ref.current?.select();
	}, []);

	const commit = () => onCommit(edge.id, value);
	return (
		<div
			className="absolute z-30 pointer-events-auto"
			style={{ left: position.x - 70, top: position.y - 14 }}
		>
			<input
				ref={ref}
				value={value}
				placeholder="Edge label…"
				onChange={(e) => setValue(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => {
					e.stopPropagation();
					if (e.key === "Enter") commit();
					if (e.key === "Escape") onCancel();
				}}
				className="w-36 px-2 py-0.5 text-xs text-center bg-[#1a1a1a] border border-primary/60 text-[#E8E8E8] outline-none shadow-lg"
				style={{ caretColor: "white" }}
			/>
		</div>
	);
}

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="space-y-2">
			<p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
				{title}
			</p>
			{children}
		</div>
	);
}

function ToggleGroup<T extends string>({
	options,
	value,
	onChange,
}: {
	options: { value: T; label: string }[];
	value: T;
	onChange: (v: T) => void;
}) {
	return (
		<div className="flex">
			{options.map(({ value: v, label }) => (
				<button
					type="button"
					key={v}
					onClick={() => onChange(v)}
					className={`flex-1 h-7 text-xs border transition-colors ${value === v ? "bg-primary/20 text-primary border-primary/50" : "border-border/40 text-muted-foreground hover:text-foreground hover:bg-white/5"} first:rounded-l-none last:rounded-r-none`}
				>
					{label}
				</button>
			))}
		</div>
	);
}

type DiagramHeaderProps = {
	onClose: () => void;
	nodeCount: number;
	edgeCount: number;
	onApplyPreset: (presetId: string) => void;
	onOpenAi: () => void;
	canUndo: boolean;
	canRedo: boolean;
	onUndo: () => void;
	onRedo: () => void;
	onPreview: () => void;
	onInsert: () => void;
};

function DiagramHeader({
	onClose,
	nodeCount,
	edgeCount,
	onApplyPreset,
	onOpenAi,
	canUndo,
	canRedo,
	onUndo,
	onRedo,
	onPreview,
	onInsert,
}: DiagramHeaderProps) {
	return (
		<header className="flex items-center justify-between h-14 px-4 border-b bg-card shrink-0">
			<div className="flex items-center gap-3">
				<Button
					variant="ghost"
					size="sm"
					onClick={onClose}
					className="h-8 gap-2 text-muted-foreground hover:text-foreground"
				>
					<ArrowLeft className="w-4 h-4" />
					Back
				</Button>
				<div className="h-4 w-px bg-border" />
				<div className="flex items-center gap-1 text-xs text-muted-foreground/60">
					<span className="font-medium text-foreground/80">Flowchart</span>
					<span>·</span>
					<span>
						{nodeCount} nodes · {edgeCount} edges
					</span>
				</div>
			</div>
			<div className="flex items-center gap-2">
				<Button
					variant="ghost"
					size="icon"
					onClick={onUndo}
					disabled={!canUndo}
					aria-label="Undo"
					className="h-8 w-8"
				>
					<Undo2 className="h-4 w-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					onClick={onRedo}
					disabled={!canRedo}
					aria-label="Redo"
					className="h-8 w-8"
				>
					<Redo2 className="h-4 w-4" />
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={onOpenAi}
					className="h-8 gap-2 border-border/50"
				>
					<Sparkles className="w-3.5 h-3.5" /> Create with AI
				</Button>
				<select
					aria-label="Choose a diagram preset"
					defaultValue=""
					onChange={(event) => {
						if (event.target.value) onApplyPreset(event.target.value);
						event.currentTarget.value = "";
					}}
					className="h-8 max-w-40 border border-border/50 bg-card px-2 text-xs text-foreground outline-none focus:border-primary"
				>
					<option value="">Presets…</option>
					{DIAGRAM_PRESETS.map((preset) => (
						<option key={preset.id} value={preset.id}>
							{preset.label}
						</option>
					))}
				</select>
				<Button
					variant="outline"
					size="sm"
					onClick={onPreview}
					className="h-8 gap-2 border-border/50"
				>
					<Eye className="w-4 h-4" /> Preview
				</Button>
				<Button size="sm" onClick={onInsert} className="h-8 gap-2 font-medium">
					<Check className="w-4 h-4" /> Insert Diagram
				</Button>
			</div>
		</header>
	);
}

function AiDiagramOverlay({
	onClose,
	onGenerate,
	isGenerating,
	error,
}: {
	onClose: () => void;
	onGenerate: (request: string) => void;
	isGenerating: boolean;
	error: string | null;
}) {
	const [request, setRequest] = useState("");
	return (
		<div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
			<div className="w-full max-w-lg border bg-card p-5 shadow-2xl">
				<div className="mb-4 flex items-center gap-2">
					<Sparkles className="h-4 w-4 text-primary" />
					<h3 className="font-semibold">Create diagram with AI</h3>
				</div>
				<p className="mb-3 text-sm text-muted-foreground">
					Describe the workflow you want. It will use your selected AI provider and
					replace the current canvas when ready.
				</p>
				<textarea
					autoFocus
					value={request}
					onChange={(event) => setRequest(event.target.value)}
					disabled={isGenerating}
					placeholder="For example: employee expense approval with finance review and reimbursement"
					className="min-h-28 w-full resize-y border bg-background p-3 text-sm outline-none focus:border-primary disabled:opacity-60"
				/>
				{error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
				<div className="mt-4 flex justify-end gap-2">
					<Button variant="ghost" size="sm" onClick={onClose} disabled={isGenerating}>
						Cancel
					</Button>
					<Button
						size="sm"
						disabled={!request.trim() || isGenerating}
						onClick={() => onGenerate(request)}
						className="gap-2"
					>
						{isGenerating ? (
							<LoaderCircle className="h-4 w-4 animate-spin" />
						) : (
							<Sparkles className="h-4 w-4" />
						)}
						{isGenerating ? "Generating…" : "Generate diagram"}
					</Button>
				</div>
			</div>
		</div>
	);
}

type NodePaletteProps = {
	onAddAtCenter: (type: string, label: string) => void;
};

function NodePalette({ onAddAtCenter }: NodePaletteProps) {
	return (
		<aside className="w-48 border-r bg-card flex flex-col shrink-0 overflow-y-auto">
			{PALETTE.map(({ section, items }) => (
				<div key={section}>
					<div className="px-3 pt-3 pb-1 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
						{section}
					</div>
					<div className="px-2 pb-2 space-y-1">
						{items.map(({ type, label, icon, hint }) => (
							<button
								key={type}
								type="button"
								draggable
								aria-label={`${hint} — drag or click to add`}
								onDragStart={(e) => onDragStart(e, type, label)}
								onClick={() => onAddAtCenter(type, label)}
								className="group flex items-center gap-2.5 px-2.5 py-2 border border-border/30 cursor-pointer bg-background hover:border-primary/50 hover:bg-primary/5 transition-colors select-none"
							>
								<span className="shrink-0">{icon}</span>
								<span className="text-xs flex-1">{label}</span>
								<Plus
									className="w-3 h-3 opacity-0 group-hover:opacity-30 transition-opacity text-muted-foreground shrink-0"
									aria-hidden
								/>
							</button>
						))}
					</div>
				</div>
			))}

			<div className="mt-auto p-3 border-t border-border/20">
				<p className="text-[10px] text-muted-foreground/40 leading-relaxed space-y-0.5">
					<span className="block">
						<kbd className="font-mono bg-[#222] px-1 rounded text-[9px]">Del</kbd>{" "}
						delete selected
					</span>
					<span className="block mt-0.5">
						<kbd className="font-mono bg-[#222] px-1 rounded text-[9px]">Dbl‑click</kbd>{" "}
						rename node
					</span>
					<span className="block mt-0.5">
						<kbd className="font-mono bg-[#222] px-1 rounded text-[9px]">
							Dbl‑click edge
						</kbd>{" "}
						label it
					</span>
				</p>
			</div>
		</aside>
	);
}

type CodePanelProps = {
	showCode: boolean;
	onToggle: () => void;
	mermaidCode: string;
	onCopy: () => void;
};

function CodePanel({ showCode, onToggle, mermaidCode, onCopy }: CodePanelProps) {
	return (
		<div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none">
			<div className="pointer-events-auto">
				<button
					type="button"
					className="mx-auto w-48 h-6 bg-card border border-b-0 rounded-t-lg flex items-center justify-center cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors"
					onClick={onToggle}
				>
					{showCode ? (
						<ChevronDown className="w-3.5 h-3.5 mr-1" />
					) : (
						<ChevronUp className="w-3.5 h-3.5 mr-1" />
					)}
					Generated Mermaid
				</button>
				<AnimatePresence>
					{showCode && (
						<m.div layout className="bg-card border-t overflow-hidden">
							<div className="p-4 h-full flex flex-col">
								<div className="flex items-center justify-between mb-2">
									<span className="text-xs font-mono text-muted-foreground">
										syntax
									</span>
									<Button
										variant="ghost"
										size="sm"
										onClick={onCopy}
										className="h-6 text-xs gap-1"
									>
										<Copy className="w-3 h-3" /> Copy
									</Button>
								</div>
								<pre className="flex-1 bg-[#0a0a0a] p-3 text-sm font-mono text-[#E8E8E8] overflow-auto border border-border/50">
									{mermaidCode}
								</pre>
							</div>
						</m.div>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
}

type PreviewOverlayProps = {
	show: boolean;
	mermaidCode: string;
	onClose: () => void;
};

function PreviewOverlay({ show, mermaidCode, onClose }: PreviewOverlayProps) {
	return (
		<AnimatePresence>
			{show && (
				<m.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-8"
					onClick={onClose}
				>
					<div
						className="bg-card border w-full max-w-4xl max-h-full flex flex-col shadow-2xl rounded-sm overflow-hidden"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="flex items-center justify-between p-4 border-b">
							<h3 className="font-semibold flex items-center gap-2">
								<Eye className="w-4 h-4 text-primary" /> Preview
							</h3>
							<Button variant="ghost" size="sm" onClick={onClose}>
								Close
							</Button>
						</div>
						<div className="flex-1 overflow-auto p-8 bg-background min-h-[400px] flex items-center justify-center">
							<MermaidPreview chart={mermaidCode} />
						</div>
					</div>
				</m.div>
			)}
		</AnimatePresence>
	);
}

type NodeInspectorSectionProps = {
	node: DiagramNode;
	labelInputRef: React.RefObject<HTMLInputElement | null>;
	onLabelChange: (id: string, label: string) => void;
	onUpdateNodeData: (id: string, patch: Partial<NodeData>) => void;
};

function NodeLabelInput({
	node,
	inputRef,
	onCommit,
}: {
	node: DiagramNode;
	inputRef: React.RefObject<HTMLInputElement | null>;
	onCommit: (id: string, label: string) => void;
}) {
	const [draft, setDraft] = useState(node.data?.label ?? "");
	const discardOnBlurRef = useRef(false);

	// Keep typing local. Committing each keypress makes the controlled canvas
	// reconcile every node and edge while the user is still editing one label.
	useEffect(() => {
		setDraft(node.data?.label ?? "");
	}, [node.id, node.data?.label]);

	const commit = useCallback(() => {
		if (discardOnBlurRef.current) {
			discardOnBlurRef.current = false;
			setDraft(node.data?.label ?? "");
			return;
		}
		const next = draft.trim() || node.data?.label || "";
		if (next !== node.data?.label) onCommit(node.id, next);
		else setDraft(next);
	}, [draft, node.data?.label, node.id, onCommit]);

	return (
		<Input
			ref={inputRef}
			value={draft}
			onChange={(event) => setDraft(event.target.value)}
			onBlur={commit}
			onKeyDown={(event) => {
				event.stopPropagation();
				if (event.key === "Enter") event.currentTarget.blur();
				if (event.key === "Escape") {
					discardOnBlurRef.current = true;
					event.currentTarget.blur();
				}
			}}
			className="h-8 text-sm font-mono rounded-none border-border/50 focus-visible:ring-primary focus-visible:ring-1 focus-visible:border-primary"
		/>
	);
}

function NodeInspectorSection({
	node,
	labelInputRef,
	onLabelChange,
	onUpdateNodeData,
}: NodeInspectorSectionProps) {
	return (
		<>
			<PanelSection title="Label">
				<NodeLabelInput node={node} inputRef={labelInputRef} onCommit={onLabelChange} />
				<p className="text-[10px] text-muted-foreground/40">
					Double-click node to rename inline
				</p>
			</PanelSection>

			<PanelSection title="Fill Color">
				<SwatchRow
					colors={FILL_COLORS}
					value={node.data?.fillColor}
					onChange={(v) => onUpdateNodeData(node.id, { fillColor: v })}
				/>
			</PanelSection>

			<PanelSection title="Border Color">
				<SwatchRow
					colors={BORDER_COLORS}
					value={node.data?.accent}
					onChange={(v) => onUpdateNodeData(node.id, { accent: v })}
				/>
			</PanelSection>

			<PanelSection title="Font Size">
				<ToggleGroup
					options={[
						{ value: "sm", label: "S" },
						{ value: "md", label: "M" },
						{ value: "lg", label: "L" },
					]}
					value={(node.data?.fontSize as "sm" | "md" | "lg") ?? "md"}
					onChange={(v) => onUpdateNodeData(node.id, { fontSize: v })}
				/>
			</PanelSection>

			<PanelSection title="Border Style">
				<ToggleGroup
					options={[
						{ value: "solid", label: "Solid" },
						{ value: "dashed", label: "Dashed" },
					]}
					value={(node.data?.borderStyle as "solid" | "dashed") ?? "solid"}
					onChange={(v) => onUpdateNodeData(node.id, { borderStyle: v })}
				/>
			</PanelSection>

			<PanelSection title="Type">
				<p className="text-xs text-foreground/50 font-mono capitalize">{node.type}</p>
			</PanelSection>
		</>
	);
}

type EdgeInspectorSectionProps = {
	edge: Edge;
	// biome-ignore lint/suspicious/noExplicitAny: edge data is schema-flexible
	onUpdateEdgeProps: (id: string, patch: Partial<Edge & { data: any }>) => void;
};

function EdgeInspectorSection({ edge, onUpdateEdgeProps }: EdgeInspectorSectionProps) {
	return (
		<>
			<PanelSection title="Label">
				<Input
					value={(edge.label as string) ?? ""}
					onChange={(e) =>
						// biome-ignore lint/suspicious/noExplicitAny: label is a valid edge patch
						onUpdateEdgeProps(edge.id, { label: e.target.value } as any)
					}
					onKeyDown={(e) => e.stopPropagation()}
					placeholder="Optional label…"
					className="h-8 text-sm font-mono rounded-none border-border/50 focus-visible:ring-primary focus-visible:ring-1 focus-visible:border-primary"
				/>
				<p className="text-[10px] text-muted-foreground/40">
					Double-click edge to edit inline
				</p>
			</PanelSection>

			<PanelSection title="Style">
				<ToggleGroup
					options={[
						{ value: "default", label: "Curved" },
						{ value: "straight", label: "Straight" },
						{ value: "step", label: "Step" },
					]}
					value={(edge.type as "default" | "straight" | "step") ?? "default"}
					// biome-ignore lint/suspicious/noExplicitAny: type is a valid edge patch
					onChange={(v) => onUpdateEdgeProps(edge.id, { type: v } as any)}
				/>
			</PanelSection>

			<PanelSection title="Color">
				<SwatchRow
					colors={EDGE_COLORS}
					value={edge.data?.color as string | undefined}
					onChange={(v) =>
						onUpdateEdgeProps(edge.id, { data: { ...edge.data, color: v } })
					}
				/>
			</PanelSection>

			<PanelSection title="Options">
				<label className="flex items-center gap-2 cursor-pointer group">
					<input
						type="checkbox"
						checked={Boolean(edge.data?.dashed)}
						onChange={(e) =>
							onUpdateEdgeProps(edge.id, {
								data: { ...edge.data, dashed: e.target.checked },
							})
						}
						className="accent-primary"
					/>
					<span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
						Dashed line
					</span>
				</label>
				<label className="flex items-center gap-2 cursor-pointer group mt-2">
					<input
						type="checkbox"
						checked={edge.animated ?? false}
						onChange={(e) =>
							// biome-ignore lint/suspicious/noExplicitAny: animated is a valid edge patch
							onUpdateEdgeProps(edge.id, { animated: e.target.checked } as any)
						}
						className="accent-primary"
					/>
					<span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
						Animated
					</span>
				</label>
			</PanelSection>
		</>
	);
}

type DefaultInspectorSectionProps = {
	direction: string;
	onDirectionChange: (dir: string) => void;
	defEdgeType: "default" | "straight" | "step";
	onDefEdgeTypeChange: (v: "default" | "straight" | "step") => void;
	defEdgeColor: string;
	onDefEdgeColorChange: (v: string) => void;
	defEdgeDash: boolean;
	onDefEdgeDashChange: (v: boolean) => void;
	defEdgeAnim: boolean;
	onDefEdgeAnimChange: (v: boolean) => void;
};

function DefaultInspectorSection({
	direction,
	onDirectionChange,
	defEdgeType,
	onDefEdgeTypeChange,
	defEdgeColor,
	onDefEdgeColorChange,
	defEdgeDash,
	onDefEdgeDashChange,
	defEdgeAnim,
	onDefEdgeAnimChange,
}: DefaultInspectorSectionProps) {
	return (
		<>
			<PanelSection title="Flow Direction">
				<div className="grid grid-cols-2 gap-1.5">
					{(["TD", "LR", "RL", "BT"] as const).map((dir) => (
						<Button
							key={dir}
							variant={direction === dir ? "default" : "outline"}
							size="sm"
							onClick={() => onDirectionChange(dir)}
							className={`rounded-none h-8 text-xs ${direction === dir ? "bg-primary text-primary-foreground border-primary" : "border-border/50"}`}
						>
							{dir === "TD"
								? "↓ TD"
								: dir === "LR"
									? "→ LR"
									: dir === "RL"
										? "← RL"
										: "↑ BT"}
						</Button>
					))}
				</div>
			</PanelSection>

			<PanelSection title="Default Edge Style">
				<ToggleGroup
					options={[
						{ value: "default", label: "Curved" },
						{ value: "straight", label: "Straight" },
						{ value: "step", label: "Step" },
					]}
					value={defEdgeType}
					onChange={(v) => onDefEdgeTypeChange(v as "default" | "straight" | "step")}
				/>
			</PanelSection>

			<PanelSection title="Default Edge Color">
				<SwatchRow
					colors={EDGE_COLORS}
					value={defEdgeColor}
					onChange={onDefEdgeColorChange}
				/>
			</PanelSection>

			<PanelSection title="Default Edge Options">
				<label className="flex items-center gap-2 cursor-pointer group">
					<input
						type="checkbox"
						checked={defEdgeDash}
						onChange={(e) => onDefEdgeDashChange(e.target.checked)}
						className="accent-primary"
					/>
					<span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
						Dashed
					</span>
				</label>
				<label className="flex items-center gap-2 cursor-pointer group mt-2">
					<input
						type="checkbox"
						checked={defEdgeAnim}
						onChange={(e) => onDefEdgeAnimChange(e.target.checked)}
						className="accent-primary"
					/>
					<span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
						Animated
					</span>
				</label>
			</PanelSection>

			<div className="pt-2 border-t border-border/20">
				<div className="text-[10px] text-muted-foreground/40 leading-relaxed space-y-0.5">
					<p>Click a node or edge to edit its properties.</p>
					<p className="mt-1">Double-click node → rename inline.</p>
					<p>Double-click edge → add a label.</p>
					<p>Drag handle → connect nodes.</p>
				</div>
			</div>
		</>
	);
}

type DiagramCanvasProps = {
	reactFlowWrapper: React.RefObject<HTMLDivElement | null>;
	nodes: DiagramNode[];
	edges: Edge[];
	onNodesChange: OnNodesChange<DiagramNode>;
	onEdgesChange: OnEdgesChange<Edge>;
	onConnect: (params: Connection | Edge) => void;
	onInit: (instance: unknown) => void;
	onDrop: (event: React.DragEvent) => void;
	onDragOver: (event: React.DragEvent) => void;
	onSelectionChange: (params: { nodes: DiagramNode[]; edges: Edge[] }) => void;
	onEdgeDoubleClick: EdgeMouseHandler;
	// biome-ignore lint/suspicious/noExplicitAny: default edge options mix xyflow prop shapes
	defaultEdgeOptions: any;
	edgeLabelEdit: { edge: Edge; x: number; y: number } | null;
	onCommitEdgeLabel: (id: string, label: string) => void;
	onCancelEdgeLabel: () => void;
	showCode: boolean;
	onToggleCode: () => void;
	mermaidCode: string;
	onCopy: () => void;
};

const DiagramCanvas = memo(function DiagramCanvas({
	reactFlowWrapper,
	nodes,
	edges,
	onNodesChange,
	onEdgesChange,
	onConnect,
	onInit,
	onDrop,
	onDragOver,
	onSelectionChange,
	onEdgeDoubleClick,
	defaultEdgeOptions,
	edgeLabelEdit,
	onCommitEdgeLabel,
	onCancelEdgeLabel,
	showCode,
	onToggleCode,
	mermaidCode,
	onCopy,
}: DiagramCanvasProps) {
	return (
		<main className="flex-1 relative" ref={reactFlowWrapper}>
			<ReactFlowProvider>
				<ReactFlow
					nodes={nodes}
					edges={edges}
					onNodesChange={onNodesChange}
					onEdgesChange={onEdgesChange}
					onConnect={onConnect}
					onInit={onInit}
					onDrop={onDrop}
					onDragOver={onDragOver}
					onSelectionChange={onSelectionChange}
					onEdgeDoubleClick={onEdgeDoubleClick}
					nodeTypes={nodeTypes}
					defaultEdgeOptions={defaultEdgeOptions}
					deleteKeyCode={["Delete", "Backspace"]}
					fitView
					className="bg-[#0a0a0a]"
				>
					<Background
						variant={BackgroundVariant.Dots}
						gap={24}
						size={1}
						color="#2a2a2a"
					/>
					<Controls className="bg-card border-border fill-foreground" />
					{nodes.length === 0 && (
						<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
							<div className="text-center text-muted-foreground/30">
								<MousePointer2 className="w-8 h-8 mx-auto mb-3 opacity-40" />
								<p className="text-sm">Click or drag a node from the left panel</p>
							</div>
						</div>
					)}
				</ReactFlow>
			</ReactFlowProvider>

			{edgeLabelEdit && (
				<EdgeLabelEditor
					edge={edgeLabelEdit.edge}
					position={edgeLabelEdit}
					onCommit={onCommitEdgeLabel}
					onCancel={onCancelEdgeLabel}
				/>
			)}

			<CodePanel
				showCode={showCode}
				onToggle={onToggleCode}
				mermaidCode={mermaidCode}
				onCopy={onCopy}
			/>
		</main>
	);
});

type InspectorSidebarProps = {
	selectedNode: DiagramNode | null;
	selectedEdge: Edge | null;
	labelInputRef: React.RefObject<HTMLInputElement | null>;
	onLabelChange: (id: string, label: string) => void;
	onUpdateNodeData: (id: string, patch: Partial<NodeData>) => void;
	// biome-ignore lint/suspicious/noExplicitAny: edge data is schema-flexible
	onUpdateEdgeProps: (id: string, patch: Partial<Edge & { data: any }>) => void;
	direction: string;
	onDirectionChange: (dir: string) => void;
	defEdgeType: "default" | "straight" | "step";
	onDefEdgeTypeChange: (v: "default" | "straight" | "step") => void;
	defEdgeColor: string;
	onDefEdgeColorChange: (v: string) => void;
	defEdgeDash: boolean;
	onDefEdgeDashChange: (v: boolean) => void;
	defEdgeAnim: boolean;
	onDefEdgeAnimChange: (v: boolean) => void;
};

const InspectorSidebar = memo(function InspectorSidebar({
	selectedNode,
	selectedEdge,
	labelInputRef,
	onLabelChange,
	onUpdateNodeData,
	onUpdateEdgeProps,
	direction,
	onDirectionChange,
	defEdgeType,
	onDefEdgeTypeChange,
	defEdgeColor,
	onDefEdgeColorChange,
	defEdgeDash,
	onDefEdgeDashChange,
	defEdgeAnim,
	onDefEdgeAnimChange,
}: InspectorSidebarProps) {
	return (
		<aside className="w-64 border-l bg-card flex flex-col shrink-0">
			<div className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/50 bg-[#121212]/50">
				{selectedNode ? "Node" : selectedEdge ? "Edge" : "Canvas"}
			</div>
			<div className="flex-1 overflow-y-auto p-4 space-y-5">
				{selectedNode && (
					<NodeInspectorSection
						node={selectedNode}
						labelInputRef={labelInputRef}
						onLabelChange={onLabelChange}
						onUpdateNodeData={onUpdateNodeData}
					/>
				)}

				{selectedEdge && (
					<EdgeInspectorSection
						edge={selectedEdge}
						onUpdateEdgeProps={onUpdateEdgeProps}
					/>
				)}

				{!selectedNode && !selectedEdge && (
					<DefaultInspectorSection
						direction={direction}
						onDirectionChange={onDirectionChange}
						defEdgeType={defEdgeType}
						onDefEdgeTypeChange={onDefEdgeTypeChange}
						defEdgeColor={defEdgeColor}
						onDefEdgeColorChange={onDefEdgeColorChange}
						defEdgeDash={defEdgeDash}
						onDefEdgeDashChange={onDefEdgeDashChange}
						defEdgeAnim={defEdgeAnim}
						onDefEdgeAnimChange={onDefEdgeAnimChange}
					/>
				)}
			</div>
		</aside>
	);
});

export interface DiagramState {
	nodes: DiagramNode[];
	edges: Edge[];
	direction: string;
	code: string;
}

interface DiagramBuilderProps {
	onClose: () => void;
	onInsert: (state: DiagramState) => void;
	initialNodes?: DiagramNode[];
	initialEdges?: Edge[];
	initialDirection?: string;
}

export function DiagramBuilder({
	onClose,
	onInsert,
	initialNodes = defaultNodes,
	initialEdges = defaultEdges,
	initialDirection = "TD",
}: DiagramBuilderProps) {
	const [nodes, setNodes, onNodesChangeInternal] = useNodesState(initialNodes);
	const [edges, setEdges, onEdgesChangeInternal] = useEdgesState(initialEdges);
	const [direction, setDirection] = useState(initialDirection);

	const [selectedNode, setSelectedNode] = useState<DiagramNode | null>(null);
	const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);

	const [defEdgeType, setDefEdgeType] = useState<"default" | "straight" | "step">("default");
	const [defEdgeColor, setDefEdgeColor] = useState("");
	const [defEdgeDash, setDefEdgeDash] = useState(false);
	const [defEdgeAnim, setDefEdgeAnim] = useState(false);

	const [showCode, setShowCode] = useState(false);
	const [showPreview, setShowPreview] = useState(false);
	const [showAi, setShowAi] = useState(false);
	const [edgeLabelEdit, setEdgeLabelEdit] = useState<{ edge: Edge; x: number; y: number } | null>(
		null,
	);

	const reactFlowWrapper = useRef<HTMLDivElement>(null);
	// biome-ignore lint/suspicious/noExplicitAny: React Flow instance type is not exported cleanly
	const [rfInstance, setRfInstance] = useState<any>(null);
	const labelInputRef = useRef<HTMLInputElement>(null);
	const labelFocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const historyRef = useRef<{ past: DiagramSnapshot[]; future: DiagramSnapshot[] }>({
		past: [],
		future: [],
	});
	const [historyAvailability, setHistoryAvailability] = useState({
		canUndo: false,
		canRedo: false,
	});
	const {
		generate: generateDiagram,
		isGenerating,
		error: aiError,
		dismissError,
	} = useDiagramAi();
	const snapshot = useCallback(
		(): DiagramSnapshot => ({ nodes, edges, direction }),
		[nodes, edges, direction],
	);
	const syncHistoryAvailability = useCallback(() => {
		setHistoryAvailability({
			canUndo: historyRef.current.past.length > 0,
			canRedo: historyRef.current.future.length > 0,
		});
	}, []);
	const pushHistory = useCallback(() => {
		historyRef.current.past.push(snapshot());
		if (historyRef.current.past.length > 50) historyRef.current.past.shift();
		historyRef.current.future = [];
		syncHistoryAvailability();
	}, [snapshot, syncHistoryAvailability]);
	const onNodesChange = useCallback(
		(changes: Parameters<OnNodesChange<DiagramNode>>[0]) => {
			if (changes.some((change) => change.type === "remove")) pushHistory();
			onNodesChangeInternal(changes);
		},
		[onNodesChangeInternal, pushHistory],
	);
	const onEdgesChange = useCallback(
		(changes: Parameters<OnEdgesChange<Edge>>[0]) => {
			if (changes.some((change) => change.type === "remove")) pushHistory();
			onEdgesChangeInternal(changes);
		},
		[onEdgesChangeInternal, pushHistory],
	);

	const mermaidCode = useMemo(
		() => generateMermaid(nodes, edges, direction),
		[nodes, edges, direction],
	);

	useEffect(() => {
		if (labelFocusTimerRef.current) {
			clearTimeout(labelFocusTimerRef.current);
		}
		if (selectedNode) {
			labelFocusTimerRef.current = setTimeout(() => labelInputRef.current?.focus(), 60);
		}
		return () => {
			if (labelFocusTimerRef.current) {
				clearTimeout(labelFocusTimerRef.current);
				labelFocusTimerRef.current = null;
			}
		};
	}, [selectedNode]);

	const onLabelChange = useCallback(
		(id: string, label: string) => {
			pushHistory();
			setNodes((nds) =>
				nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n)),
			);
			setSelectedNode((prev) =>
				prev?.id === id ? { ...prev, data: { ...prev.data, label } } : prev,
			);
		},
		[setNodes, pushHistory],
	);

	const updateNodeData = useCallback(
		(id: string, patch: Partial<NodeData>) => {
			pushHistory();
			setNodes((nds) =>
				nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
			);
			setSelectedNode((prev) =>
				prev?.id === id ? { ...prev, data: { ...prev.data, ...patch } } : prev,
			);
		},
		[setNodes, pushHistory],
	);

	const updateEdgeProps = useCallback(
		// biome-ignore lint/suspicious/noExplicitAny: edge data is schema-flexible
		(id: string, patch: Partial<Edge & { data: any }>) => {
			pushHistory();
			setEdges((eds) =>
				eds.map((e) => {
					if (e.id !== id) return e;
					const merged = { ...e, ...patch };
					const color = (patch.data?.color ?? e.data?.color) || undefined;
					merged.style = color ? { stroke: color, strokeWidth: 1.5 } : undefined;
					merged.data = { ...e.data, ...patch.data };
					return merged;
				}),
			);
			setSelectedEdge((prev) => {
				if (!prev || prev.id !== id) return prev;
				const merged = { ...prev, ...patch, data: { ...prev.data, ...patch.data } };
				const color = merged.data?.color || undefined;
				merged.style = color ? { stroke: color, strokeWidth: 1.5 } : undefined;
				return merged;
			});
		},
		[setEdges, pushHistory],
	);

	const commitEdgeLabel = useCallback(
		(id: string, label: string) => {
			// biome-ignore lint/suspicious/noExplicitAny: label is a valid edge patch
			updateEdgeProps(id, { label } as any);
			setEdgeLabelEdit(null);
		},
		[updateEdgeProps],
	);

	const onConnect = useCallback(
		(params: Connection | Edge) => {
			pushHistory();
			const color = defEdgeColor || undefined;
			setEdges((eds) => {
				const newEdges = addEdge(
					{
						...params,
						type: defEdgeType,
						animated: defEdgeAnim,
						data: { dashed: defEdgeDash, color },
					},
					eds,
				);
				return newEdges.map((e, i) =>
					i === newEdges.length - 1
						? { ...e, style: color ? { stroke: color, strokeWidth: 1.5 } : undefined }
						: e,
				);
			});
		},
		[setEdges, defEdgeType, defEdgeColor, defEdgeDash, defEdgeAnim, pushHistory],
	);

	const onDragOver = useCallback((event: React.DragEvent) => {
		event.preventDefault();
		event.dataTransfer.dropEffect = "move";
	}, []);
	const onDrop = useCallback(
		(event: React.DragEvent) => {
			event.preventDefault();
			if (!rfInstance) return;
			const type = event.dataTransfer.getData("application/reactflow");
			const label = event.dataTransfer.getData("application/label");
			if (!type) return;
			pushHistory();
			const position = rfInstance.screenToFlowPosition({
				x: event.clientX,
				y: event.clientY,
			});
			setNodes((nds) =>
				nds.concat({
					id: `node-${nds.length + 1}-${type}`,
					type,
					position,
					data: { label: label || type },
				} as DiagramNode),
			);
		},
		[rfInstance, setNodes, pushHistory],
	);

	const addAtCenter = useCallback(
		(type: string, label: string) => {
			if (!rfInstance || !reactFlowWrapper.current) return;
			pushHistory();
			const b = reactFlowWrapper.current.getBoundingClientRect();
			const pos = rfInstance.screenToFlowPosition({
				x: b.left + b.width / 2,
				y: b.top + b.height / 2,
			});
			setNodes((nds) => {
				const offset = (nds.length % 5) * 24;
				return nds.concat({
					id: `node-${nds.length + 1}-${type}`,
					type,
					position: { x: pos.x + offset, y: pos.y + offset },
					data: { label },
				} as DiagramNode);
			});
		},
		[rfInstance, setNodes, pushHistory],
	);

	const onSelectionChange = useCallback(
		({ nodes: sn, edges: se }: { nodes: DiagramNode[]; edges: Edge[] }) => {
			const nextNode = sn[0] ?? null;
			const nextEdge = sn.length === 0 ? (se[0] ?? null) : null;
			setSelectedNode((current) => (current?.id === nextNode?.id ? current : nextNode));
			setSelectedEdge((current) => (current?.id === nextEdge?.id ? current : nextEdge));
		},
		[],
	);

	const onEdgeDoubleClick: EdgeMouseHandler = useCallback((event, edge) => {
		const b = reactFlowWrapper.current?.getBoundingClientRect();
		setEdgeLabelEdit({
			edge,
			x: event.clientX - (b?.left ?? 0),
			y: event.clientY - (b?.top ?? 0),
		});
	}, []);

	const handleCopy = useCallback(() => {
		void navigator.clipboard.writeText(mermaidCode);
		showUserToast("Mermaid syntax copied.", "success");
	}, [mermaidCode]);

	const defaultEdgeOptions = useMemo(
		() => ({
			type: defEdgeType,
			animated: defEdgeAnim,
			data: { dashed: defEdgeDash, color: defEdgeColor || undefined },
			style: defEdgeColor ? { stroke: defEdgeColor, strokeWidth: 1.5 } : undefined,
		}),
		[defEdgeType, defEdgeAnim, defEdgeDash, defEdgeColor],
	);
	const openPreview = useCallback(() => setShowPreview(true), []);
	const closePreview = useCallback(() => setShowPreview(false), []);
	const closeEdgeLabelEditor = useCallback(() => setEdgeLabelEdit(null), []);
	const toggleCode = useCallback(() => setShowCode((visible) => !visible), []);
	const insertDiagram = useCallback(
		() => onInsert({ nodes, edges, direction, code: mermaidCode }),
		[onInsert, nodes, edges, direction, mermaidCode],
	);
	const undo = useCallback(() => {
		const previous = historyRef.current.past.pop();
		if (!previous) return;
		historyRef.current.future.push(snapshot());
		setNodes(previous.nodes);
		setEdges(previous.edges);
		setDirection(previous.direction);
		setSelectedNode(null);
		setSelectedEdge(null);
		syncHistoryAvailability();
	}, [snapshot, setNodes, setEdges, syncHistoryAvailability]);
	const redo = useCallback(() => {
		const next = historyRef.current.future.pop();
		if (!next) return;
		historyRef.current.past.push(snapshot());
		setNodes(next.nodes);
		setEdges(next.edges);
		setDirection(next.direction);
		setSelectedNode(null);
		setSelectedEdge(null);
		syncHistoryAvailability();
	}, [snapshot, setNodes, setEdges, syncHistoryAvailability]);
	const changeDirection = useCallback(
		(nextDirection: string) => {
			if (nextDirection === direction) return;
			pushHistory();
			setDirection(nextDirection);
		},
		[direction, pushHistory],
	);
	const applyPreset = useCallback(
		(presetId: string) => {
			const preset = getDiagramPreset(presetId);
			if (!preset) return;
			if (
				nodes.length &&
				!window.confirm(`Replace this diagram with the ${preset.label} preset?`)
			) {
				return;
			}
			pushHistory();
			const next = cloneDiagramPreset(preset);
			setNodes(next.nodes);
			setEdges(next.edges);
			setDirection(next.direction);
			setSelectedNode(null);
			setSelectedEdge(null);
			setEdgeLabelEdit(null);
			showUserToast(`${preset.label} preset applied.`, "success");
		},
		[nodes.length, setNodes, setEdges, pushHistory],
	);
	const openAi = useCallback(() => {
		dismissError();
		setShowAi(true);
	}, [dismissError]);
	const closeAi = useCallback(() => setShowAi(false), []);
	const createWithAi = useCallback(
		(request: string) => {
			void generateDiagram(request).then((diagram) => {
				if (!diagram) return;
				pushHistory();
				setNodes(diagram.nodes);
				setEdges(diagram.edges);
				setDirection(diagram.direction);
				setSelectedNode(null);
				setSelectedEdge(null);
				setShowAi(false);
				showUserToast("AI diagram created.", "success");
			});
		},
		[generateDiagram, setNodes, setEdges, pushHistory],
	);

	const contextValue = useMemo(() => ({ onLabelChange }), [onLabelChange]);

	return (
		<LazyMotion features={domAnimation}>
			<DiagramContext.Provider value={contextValue}>
				<m.div
					initial={{ y: "100%" }}
					animate={{ y: 0 }}
					exit={{ y: "100%" }}
					transition={{ type: "spring", damping: 25, stiffness: 200 }}
					className="fixed inset-0 z-50 flex flex-col bg-background text-foreground overflow-hidden"
				>
					<DiagramHeader
						onClose={onClose}
						nodeCount={nodes.length}
						edgeCount={edges.length}
						onApplyPreset={applyPreset}
						onOpenAi={openAi}
						canUndo={historyAvailability.canUndo}
						canRedo={historyAvailability.canRedo}
						onUndo={undo}
						onRedo={redo}
						onPreview={openPreview}
						onInsert={insertDiagram}
					/>

					<div className="flex flex-1 overflow-hidden">
						<NodePalette onAddAtCenter={addAtCenter} />

						<DiagramCanvas
							reactFlowWrapper={reactFlowWrapper}
							nodes={nodes}
							edges={edges}
							onNodesChange={onNodesChange}
							onEdgesChange={onEdgesChange}
							onConnect={onConnect}
							onInit={setRfInstance}
							onDrop={onDrop}
							onDragOver={onDragOver}
							onSelectionChange={onSelectionChange}
							onEdgeDoubleClick={onEdgeDoubleClick}
							defaultEdgeOptions={defaultEdgeOptions}
							edgeLabelEdit={edgeLabelEdit}
							onCommitEdgeLabel={commitEdgeLabel}
							onCancelEdgeLabel={closeEdgeLabelEditor}
							showCode={showCode}
							onToggleCode={toggleCode}
							mermaidCode={mermaidCode}
							onCopy={handleCopy}
						/>

						<InspectorSidebar
							selectedNode={selectedNode}
							selectedEdge={selectedEdge}
							labelInputRef={labelInputRef}
							onLabelChange={onLabelChange}
							onUpdateNodeData={updateNodeData}
							onUpdateEdgeProps={updateEdgeProps}
							direction={direction}
							onDirectionChange={changeDirection}
							defEdgeType={defEdgeType}
							onDefEdgeTypeChange={setDefEdgeType}
							defEdgeColor={defEdgeColor}
							onDefEdgeColorChange={setDefEdgeColor}
							defEdgeDash={defEdgeDash}
							onDefEdgeDashChange={setDefEdgeDash}
							defEdgeAnim={defEdgeAnim}
							onDefEdgeAnimChange={setDefEdgeAnim}
						/>
					</div>

					<PreviewOverlay
						show={showPreview}
						mermaidCode={mermaidCode}
						onClose={closePreview}
					/>
					{showAi ? (
						<AiDiagramOverlay
							onClose={closeAi}
							onGenerate={createWithAi}
							isGenerating={isGenerating}
							error={aiError}
						/>
					) : null}
				</m.div>
			</DiagramContext.Provider>
		</LazyMotion>
	);
}
