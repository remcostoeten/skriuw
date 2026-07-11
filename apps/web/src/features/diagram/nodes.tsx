import { useEffect, useRef, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useDiagramContext } from "./diagram-context";

export interface NodeData extends Record<string, unknown> {
	label: string;
	accent?: string;
	fillColor?: string;
	fontSize?: "sm" | "md" | "lg";
	borderStyle?: "solid" | "dashed";
}

const DEFAULT_BG = "#171717";
const DEFAULT_TEXT = "#E8E8E8";
const DEFAULT_BORDER = "#333333";

const getBg = (d: NodeData) => d.fillColor || DEFAULT_BG;
const getBC = (d: NodeData, selected?: boolean) =>
	d.accent ?? (selected ? "#3b82f6" : DEFAULT_BORDER);
const getFS = (d: NodeData) =>
	d.fontSize === "lg" ? "text-base" : d.fontSize === "sm" ? "text-xs" : "text-sm";
const getDash = (d: NodeData) => (d.borderStyle === "dashed" ? "6 3" : undefined);
const getSW = (selected?: boolean) => (selected ? 2 : 1);

const HANDLE_CLS = "!w-2 !h-2 !bg-primary !border-background !rounded-none";

function InlineLabel({
	nodeId,
	label,
	className,
}: {
	nodeId: string;
	label: string;
	className?: string;
}) {
	const { onLabelChange } = useDiagramContext();
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(label);
	const inputRef = useRef<HTMLInputElement>(null);

	if (!editing && draft !== label) {
		setDraft(label);
	}
	useEffect(() => {
		if (editing) {
			inputRef.current?.focus();
			inputRef.current?.select();
		}
	}, [editing]);

	const commit = () => {
		setEditing(false);
		const next = draft.trim() || label;
		setDraft(next);
		if (next !== label) onLabelChange(nodeId, next);
	};

	if (editing) {
		return (
			<input
				ref={inputRef}
				aria-label={`Rename ${label}`}
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => {
					e.stopPropagation();
					if (e.key === "Enter") commit();
					if (e.key === "Escape") {
						setDraft(label);
						setEditing(false);
					}
				}}
				onClick={(e) => e.stopPropagation()}
				className={`bg-transparent border-b border-primary/70 outline-none text-center w-full min-w-0 ${className ?? ""}`}
				style={{ caretColor: "white" }}
			/>
		);
	}

	return (
		<button
			type="button"
			className={`cursor-text select-none outline-none ${className ?? ""}`}
			aria-label={`Rename: ${label}`}
			onDoubleClick={(e) => {
				e.stopPropagation();
				setEditing(true);
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " " || e.key === "Spacebar" || e.key === "F2") {
					e.preventDefault();
					e.stopPropagation();
					setEditing(true);
				}
			}}
		>
			{label}
		</button>
	);
}

export function ProcessNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
	const bc = getBC(data, selected);
	return (
		<div
			className={`relative flex items-center justify-center min-w-[120px] px-4 py-2 shadow-md transition-colors ${selected ? "ring-1 ring-primary" : ""}`}
			style={{
				border: `${getSW(selected)}px ${data.borderStyle ?? "solid"} ${bc}`,
				backgroundColor: getBg(data),
			}}
		>
			<Handle type="target" position={Position.Top} className={HANDLE_CLS} />
			<Handle type="target" position={Position.Left} id="left" className={HANDLE_CLS} />
			<span style={{ color: DEFAULT_TEXT }} className={getFS(data)}>
				<InlineLabel nodeId={id} label={data.label} className={getFS(data)} />
			</span>
			<Handle type="source" position={Position.Right} id="right" className={HANDLE_CLS} />
			<Handle type="source" position={Position.Bottom} className={HANDLE_CLS} />
		</div>
	);
}

export function DecisionNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
	const bc = getBC(data, selected);
	return (
		<div className="relative flex items-center justify-center min-w-[120px] min-h-[80px]">
			<div
				className={`absolute inset-0 shadow-md transition-colors ${selected ? "ring-1 ring-primary" : ""}`}
				style={{
					transform: "rotate(45deg) scale(0.7)",
					border: `${getSW(selected)}px ${data.borderStyle ?? "solid"} ${bc}`,
					backgroundColor: getBg(data),
				}}
			/>
			<div
				className={`relative z-10 text-center max-w-[80px] leading-tight px-2 ${getFS(data)}`}
				style={{ color: DEFAULT_TEXT }}
			>
				<InlineLabel nodeId={id} label={data.label} className={getFS(data)} />
			</div>
			<Handle type="target" position={Position.Top} className={`${HANDLE_CLS} z-20`} />
			<Handle
				type="target"
				position={Position.Left}
				id="left"
				className={`${HANDLE_CLS} z-20`}
			/>
			<Handle
				type="source"
				position={Position.Right}
				id="right"
				className={`${HANDLE_CLS} z-20`}
			/>
			<Handle type="source" position={Position.Bottom} className={`${HANDLE_CLS} z-20`} />
		</div>
	);
}

export function TerminalNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
	const bc = getBC(data, selected);
	return (
		<div
			className={`relative flex items-center justify-center min-w-[100px] px-5 py-2 shadow-md transition-colors !rounded-full ${selected ? "ring-1 ring-primary" : ""}`}
			style={{
				border: `${getSW(selected)}px ${data.borderStyle ?? "solid"} ${bc}`,
				backgroundColor: getBg(data),
			}}
		>
			<Handle type="target" position={Position.Top} className={HANDLE_CLS} />
			<Handle type="target" position={Position.Left} id="left" className={HANDLE_CLS} />
			<span style={{ color: DEFAULT_TEXT }} className={getFS(data)}>
				<InlineLabel nodeId={id} label={data.label} className={getFS(data)} />
			</span>
			<Handle type="source" position={Position.Right} id="right" className={HANDLE_CLS} />
			<Handle type="source" position={Position.Bottom} className={HANDLE_CLS} />
		</div>
	);
}

export function DataNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
	const bc = getBC(data, selected);
	return (
		<div className="relative flex items-center justify-center min-w-[140px] h-[40px]">
			<div
				className={`absolute inset-0 shadow-md transition-colors ${selected ? "ring-1 ring-primary" : ""}`}
				style={{
					transform: "skew(-20deg)",
					border: `${getSW(selected)}px ${data.borderStyle ?? "solid"} ${bc}`,
					backgroundColor: getBg(data),
				}}
			/>
			<div
				className={`relative z-10 text-center ${getFS(data)}`}
				style={{ color: DEFAULT_TEXT }}
			>
				<InlineLabel nodeId={id} label={data.label} className={getFS(data)} />
			</div>
			<Handle type="target" position={Position.Top} className={`${HANDLE_CLS} z-20`} />
			<Handle
				type="target"
				position={Position.Left}
				id="left"
				className={`${HANDLE_CLS} z-20`}
			/>
			<Handle
				type="source"
				position={Position.Right}
				id="right"
				className={`${HANDLE_CLS} z-20`}
			/>
			<Handle type="source" position={Position.Bottom} className={`${HANDLE_CLS} z-20`} />
		</div>
	);
}

export function CircleNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
	const bc = getBC(data, selected);
	return (
		<div
			className={`relative flex items-center justify-center shadow-md transition-colors ${selected ? "ring-1 ring-primary" : ""}`}
			style={{
				width: 90,
				height: 90,
				borderRadius: "50%",
				border: `${getSW(selected)}px ${data.borderStyle ?? "solid"} ${bc}`,
				backgroundColor: getBg(data),
			}}
		>
			<div className={`text-center px-2 ${getFS(data)}`} style={{ color: DEFAULT_TEXT }}>
				<InlineLabel nodeId={id} label={data.label} className={getFS(data)} />
			</div>
			<Handle type="target" position={Position.Top} className={HANDLE_CLS} />
			<Handle type="target" position={Position.Left} id="left" className={HANDLE_CLS} />
			<Handle type="source" position={Position.Right} id="right" className={HANDLE_CLS} />
			<Handle type="source" position={Position.Bottom} className={HANDLE_CLS} />
		</div>
	);
}

export function SubroutineNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
	const bc = getBC(data, selected);
	const bs = data.borderStyle ?? "solid";
	return (
		<div
			className={`relative flex items-center justify-center min-w-[140px] px-8 py-2 shadow-md transition-colors ${selected ? "ring-1 ring-primary" : ""}`}
			style={{ border: `${getSW(selected)}px ${bs} ${bc}`, backgroundColor: getBg(data) }}
		>
			<div
				className="absolute left-4 top-0 bottom-0"
				style={{ borderLeft: `1px ${bs} ${bc}` }}
			/>
			<div
				className="absolute right-4 top-0 bottom-0"
				style={{ borderRight: `1px ${bs} ${bc}` }}
			/>
			<Handle type="target" position={Position.Top} className={HANDLE_CLS} />
			<Handle type="target" position={Position.Left} id="left" className={HANDLE_CLS} />
			<span style={{ color: DEFAULT_TEXT }} className={getFS(data)}>
				<InlineLabel nodeId={id} label={data.label} className={getFS(data)} />
			</span>
			<Handle type="source" position={Position.Right} id="right" className={HANDLE_CLS} />
			<Handle type="source" position={Position.Bottom} className={HANDLE_CLS} />
		</div>
	);
}

export function CylinderNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
	const bc = getBC(data, selected);
	const bg = getBg(data);
	const sw = getSW(selected);
	const dash = getDash(data);
	const W = 140,
		H = 80,
		RY = 12,
		CX = 70;

	return (
		<div className="relative" style={{ width: W, height: H }}>
			<svg
				width={W}
				height={H}
				style={{ position: "absolute", top: 0, left: 0, overflow: "visible" }}
			>
				<ellipse
					cx={CX}
					cy={H - RY}
					rx={CX - 10}
					ry={RY}
					fill={bg}
					stroke={bc}
					strokeWidth={sw}
					strokeDasharray={dash}
				/>
				<rect x={10} y={RY} width={W - 20} height={H - RY * 2} fill={bg} stroke="none" />
				<line
					x1={10}
					y1={RY}
					x2={10}
					y2={H - RY}
					stroke={bc}
					strokeWidth={sw}
					strokeDasharray={dash}
				/>
				<line
					x1={W - 10}
					y1={RY}
					x2={W - 10}
					y2={H - RY}
					stroke={bc}
					strokeWidth={sw}
					strokeDasharray={dash}
				/>
				<ellipse
					cx={CX}
					cy={RY}
					rx={CX - 10}
					ry={RY}
					fill={bg}
					stroke={bc}
					strokeWidth={sw}
					strokeDasharray={dash}
				/>
				{selected && (
					<ellipse
						cx={CX}
						cy={RY}
						rx={CX - 10}
						ry={RY}
						fill="none"
						stroke="#3b82f6"
						strokeWidth={1}
						opacity={0.4}
					/>
				)}
			</svg>
			<div
				className="absolute inset-0 flex items-center justify-center"
				style={{ color: DEFAULT_TEXT, paddingTop: RY }}
			>
				<InlineLabel nodeId={id} label={data.label} className={getFS(data)} />
			</div>
			<Handle
				type="target"
				position={Position.Top}
				className={HANDLE_CLS}
				style={{ top: 4 }}
			/>
			<Handle
				type="source"
				position={Position.Bottom}
				className={HANDLE_CLS}
				style={{ bottom: 4 }}
			/>
			<Handle
				type="target"
				position={Position.Left}
				id="left"
				className={`${HANDLE_CLS} z-20`}
			/>
			<Handle
				type="source"
				position={Position.Right}
				id="right"
				className={`${HANDLE_CLS} z-20`}
			/>
		</div>
	);
}

export function HexagonNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
	const bc = getBC(data, selected);
	const bg = getBg(data);
	const sw = getSW(selected);
	const dash = getDash(data);
	const W = 150,
		H = 72;
	const pts = `20,${H / 2} 37,6 ${W - 37},6 ${W - 20},${H / 2} ${W - 37},${H - 6} 37,${H - 6}`;

	return (
		<div className="relative" style={{ width: W, height: H }}>
			<svg width={W} height={H} style={{ position: "absolute", top: 0, left: 0 }}>
				<polygon
					points={pts}
					fill={bg}
					stroke={bc}
					strokeWidth={sw}
					strokeDasharray={dash}
				/>
				{selected && (
					<polygon
						points={pts}
						fill="none"
						stroke="#3b82f6"
						strokeWidth={1}
						opacity={0.5}
					/>
				)}
			</svg>
			<div
				className="absolute inset-0 flex items-center justify-center"
				style={{ color: DEFAULT_TEXT }}
			>
				<InlineLabel
					nodeId={id}
					label={data.label}
					className={`${getFS(data)} px-6 text-center`}
				/>
			</div>
			<Handle type="target" position={Position.Top} className={`${HANDLE_CLS} z-20`} />
			<Handle
				type="target"
				position={Position.Left}
				id="left"
				className={`${HANDLE_CLS} z-20`}
				style={{ left: 16 }}
			/>
			<Handle
				type="source"
				position={Position.Right}
				id="right"
				className={`${HANDLE_CLS} z-20`}
				style={{ right: 16 }}
			/>
			<Handle type="source" position={Position.Bottom} className={`${HANDLE_CLS} z-20`} />
		</div>
	);
}

export function NoteNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
	const bc = getBC(data, selected);
	const bg = getBg(data);
	const sw = getSW(selected);
	const dash = getDash(data);
	const W = 150,
		H = 70,
		FOLD = 24;
	const bodyPts = `0,0 ${W - FOLD},0 ${W},${FOLD} ${W},${H} 0,${H}`;
	const foldPts = `${W - FOLD},0 ${W},${FOLD} ${W - FOLD},${FOLD}`;

	return (
		<div className="relative" style={{ width: W, height: H }}>
			<svg width={W} height={H} style={{ position: "absolute", top: 0, left: 0 }}>
				<polygon
					points={bodyPts}
					fill={bg}
					stroke={bc}
					strokeWidth={sw}
					strokeDasharray={dash}
				/>
				<polygon
					points={foldPts}
					fill="#0a0a0a"
					stroke={bc}
					strokeWidth={sw}
					strokeDasharray={dash}
				/>
				{selected && (
					<polygon
						points={bodyPts}
						fill="none"
						stroke="#3b82f6"
						strokeWidth={1}
						opacity={0.5}
					/>
				)}
			</svg>
			<div
				className="absolute flex items-center justify-center text-center"
				style={{ color: DEFAULT_TEXT, top: 0, left: 0, right: FOLD + 4, bottom: 0 }}
			>
				<InlineLabel nodeId={id} label={data.label} className={`${getFS(data)} px-3`} />
			</div>
			<Handle type="target" position={Position.Top} className={`${HANDLE_CLS} z-20`} />
			<Handle
				type="target"
				position={Position.Left}
				id="left"
				className={`${HANDLE_CLS} z-20`}
			/>
			<Handle
				type="source"
				position={Position.Right}
				id="right"
				className={`${HANDLE_CLS} z-20`}
			/>
			<Handle type="source" position={Position.Bottom} className={`${HANDLE_CLS} z-20`} />
		</div>
	);
}

