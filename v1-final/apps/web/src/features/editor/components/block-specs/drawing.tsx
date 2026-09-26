"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	CheckIcon,
	ChevronsRightLeftIcon,
	MoveDiagonalIcon,
	SprayCanIcon,
} from "@animateicons/react/lucide";
import { defaultProps } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import {
	ArrowRight,
	Circle,
	Diamond,
	Eraser,
	GripVertical,
	Image as ImageIcon,
	Minus,
	MousePointer2,
	Pencil,
	Square,
	Type,
} from "lucide-react";
import {
	countDrawingElements,
	DEFAULT_DRAWING_SCENE,
	parseDrawingScene,
} from "@/shared/lib/drawing";
import { cn } from "@/shared/lib/utils";
import { useShortcutHint, useShortcutScope, type ShortcutId } from "@/core/shortcuts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import "@excalidraw/excalidraw/index.css";
import "./drawing.css";

type TExcalidrawModule = typeof import("@excalidraw/excalidraw");

type TToolType =
	| "selection"
	| "rectangle"
	| "diamond"
	| "ellipse"
	| "arrow"
	| "line"
	| "freedraw"
	| "text"
	| "image"
	| "eraser";

type TExcalidrawAPI = {
	updateScene: (scene: { elements?: readonly unknown[] }) => void;
	addFiles: (files: unknown[]) => void;
	setActiveTool: (tool: { type: TToolType }) => void;
};

type TDrawingBlockData = {
	props: {
		scene?: string;
		height?: number;
		toolbarX?: number;
		toolbarY?: number;
	};
};

type TDrawingBlockProps = {
	scene?: string;
	height?: number;
	toolbarX?: number;
	toolbarY?: number;
};

type TDrawingEditor = {
	isEditable?: boolean;
	updateBlock: (block: unknown, update: { type: "drawing"; props: TDrawingBlockProps }) => void;
};

const TOOLS: Array<{
	type: TToolType;
	icon: typeof Square;
	label: string;
	shortcutId: ShortcutId;
}> = [
	{ type: "selection", icon: MousePointer2, label: "Select", shortcutId: "drawing.selection" },
	{ type: "rectangle", icon: Square, label: "Rectangle", shortcutId: "drawing.rectangle" },
	{ type: "diamond", icon: Diamond, label: "Diamond", shortcutId: "drawing.diamond" },
	{ type: "ellipse", icon: Circle, label: "Ellipse", shortcutId: "drawing.ellipse" },
	{ type: "arrow", icon: ArrowRight, label: "Arrow", shortcutId: "drawing.arrow" },
	{ type: "line", icon: Minus, label: "Line", shortcutId: "drawing.line" },
	{ type: "freedraw", icon: Pencil, label: "Draw", shortcutId: "drawing.freedraw" },
	{ type: "text", icon: Type, label: "Text", shortcutId: "drawing.text" },
	{ type: "image", icon: ImageIcon, label: "Image", shortcutId: "drawing.image" },
	{ type: "eraser", icon: Eraser, label: "Eraser", shortcutId: "drawing.eraser" },
];

const SCENE_COMMIT_DEBOUNCE_MS = 500;
const MIN_CANVAS_HEIGHT = 180;
const MAX_CANVAS_HEIGHT = 1200;
const DEFAULT_CANVAS_HEIGHT = 400;
const DEFAULT_TOOLBAR_X = 0.5;
const DEFAULT_TOOLBAR_Y = 0.04;

function clampFraction(value: number): number {
	return Math.min(1, Math.max(0, value));
}

let excalidrawModulePromise: Promise<TExcalidrawModule> | null = null;

function loadExcalidraw(): Promise<TExcalidrawModule> {
	excalidrawModulePromise ??= import("@excalidraw/excalidraw");
	return excalidrawModulePromise;
}

function isDarkSurface(): boolean {
	if (typeof document === "undefined") {
		return true;
	}
	const color = getComputedStyle(document.body).backgroundColor;
	const channels = color.match(/\d+(\.\d+)?/g);
	if (!channels || channels.length < 3) {
		return true;
	}
	const [r, g, b] = channels.map(Number);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

function clampHeight(height: number): number {
	return Math.min(MAX_CANVAS_HEIGHT, Math.max(MIN_CANVAS_HEIGHT, Math.round(height)));
}

const UI_OPTIONS = {
	canvasActions: {
		changeViewBackgroundColor: false,
		clearCanvas: false,
		export: false,
		loadScene: false,
		saveToActiveFile: false,
		saveAsImage: false,
		toggleTheme: false,
	},
};

type TAnimatedIcon = React.ForwardRefExoticComponent<
	{ size?: number; className?: string } & React.RefAttributes<{
		startAnimation: () => void;
		stopAnimation: () => void;
	}>
>;

type TToolbarButtonProps = {
	icon: TAnimatedIcon;
	label: string;
	hint: string;
	onClick: () => void;
};

function ToolbarButton({ icon: Icon, label, hint, onClick }: TToolbarButtonProps) {
	const iconRef = useRef<{ startAnimation: () => void; stopAnimation: () => void }>(null);

	return (
		<DrawingTooltip label={hint}>
			<button
				type="button"
				aria-label={label}
				className={cn(
					"group/tool relative flex h-7 w-7 items-center justify-center rounded-md",
					"text-muted-foreground/70 transition-colors",
					"hover:bg-foreground/8 hover:text-foreground",
					"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
				)}
				onMouseDown={(event) => event.preventDefault()}
				onMouseEnter={() => iconRef.current?.startAnimation()}
				onMouseLeave={() => iconRef.current?.stopAnimation()}
				onFocus={() => iconRef.current?.startAnimation()}
				onBlur={() => iconRef.current?.stopAnimation()}
				onClick={onClick}
			>
				<Icon
					ref={iconRef}
					size={15}
					className="skriuw-animated-icon pointer-events-none"
				/>
			</button>
		</DrawingTooltip>
	);
}

type TDrawingToolbarProps = {
	activeTool: TToolType;
	position: { x: number; y: number };
	onSelectTool: (tool: TToolType) => void;
	onDragStart: (event: React.PointerEvent) => void;
};

function DrawingTooltip({
	label,
	shortcutId,
	children,
}: {
	label: string;
	shortcutId?: ShortcutId;
	children: React.ReactNode;
}) {
	const shortcut = useShortcutHint(shortcutId);

	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent side="bottom" className="px-2 py-1 text-xs" shortcut={shortcut}>
				{label}
			</TooltipContent>
		</Tooltip>
	);
}

function DrawingToolbar({ activeTool, position, onSelectTool, onDragStart }: TDrawingToolbarProps) {
	return (
		<div
			role="toolbar"
			aria-label="Drawing tools"
			className={cn(
				"absolute z-20 flex items-center gap-0.5 rounded-lg",
				"border border-border/60 bg-popover/80 p-1 shadow-md backdrop-blur-md",
			)}
			style={{
				left: `${position.x * 100}%`,
				top: `${position.y * 100}%`,
				transform: "translate(-50%, 0)",
			}}
			onPointerDown={(event) => event.stopPropagation()}
		>
			<DrawingTooltip label="Move toolbar">
				<button
					type="button"
					aria-label="Move toolbar"
					className="flex h-7 w-4 cursor-grab items-center justify-center text-muted-foreground/50 hover:text-foreground active:cursor-grabbing"
					onPointerDown={onDragStart}
				>
					<GripVertical size={13} />
				</button>
			</DrawingTooltip>
			{TOOLS.map((tool) => {
				const Icon = tool.icon;
				const selected = activeTool === tool.type;
				return (
					<DrawingTooltip key={tool.type} label={tool.label} shortcutId={tool.shortcutId}>
						<button
							type="button"
							aria-label={tool.label}
							aria-pressed={selected}
							className={cn(
								"flex h-7 w-7 items-center justify-center rounded-md transition-colors",
								"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
								selected
									? "bg-foreground/12 text-foreground"
									: "text-muted-foreground/70 hover:bg-foreground/8 hover:text-foreground",
							)}
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => onSelectTool(tool.type)}
						>
							<Icon size={15} className="skriuw-animated-icon pointer-events-none" />
						</button>
					</DrawingTooltip>
				);
			})}
		</div>
	);
}

function DrawingBlockView({ block, editor }: { block: TDrawingBlockData; editor: TDrawingEditor }) {
	const scene = block.props.scene ?? DEFAULT_DRAWING_SCENE;
	const storedHeight = clampHeight(block.props.height ?? DEFAULT_CANVAS_HEIGHT);

	const wrapperRef = useRef<HTMLElement | null>(null);
	const blockRef = useRef(block);
	const editorRef = useRef(editor);
	const apiRef = useRef<TExcalidrawAPI | null>(null);
	const moduleRef = useRef<TExcalidrawModule | null>(null);
	const activeRef = useRef(false);
	const fullscreenRef = useRef(false);
	const lastSceneRef = useRef(scene);
	const pendingCommitRef = useRef<number | null>(null);
	const latestChangeRef = useRef<{
		elements: readonly unknown[];
		appState: unknown;
		files: unknown;
	} | null>(null);

	const [excalidrawModule, setExcalidrawModule] = useState<TExcalidrawModule | null>(null);
	const [active, setActive] = useState(false);
	const [fullscreen, setFullscreen] = useState(false);
	const [dragHeight, setDragHeight] = useState<number | null>(null);
	const [darkTheme, setDarkTheme] = useState(true);
	const [activeTool, setActiveTool] = useState<TToolType>("freedraw");
	const [dragToolbar, setDragToolbar] = useState<{ x: number; y: number } | null>(null);
	const canvasBoxRef = useRef<HTMLDivElement | null>(null);
	const editable = editor.isEditable !== false;

	blockRef.current = block;
	editorRef.current = editor;
	moduleRef.current = excalidrawModule;
	activeRef.current = active;
	fullscreenRef.current = fullscreen;

	const elementCount = useMemo(() => countDrawingElements(scene), [scene]);

	const toolbarPosition = dragToolbar ?? {
		x: clampFraction(block.props.toolbarX ?? DEFAULT_TOOLBAR_X),
		y: clampFraction(block.props.toolbarY ?? DEFAULT_TOOLBAR_Y),
	};

	const initialData = useMemo(() => {
		const parsed = parseDrawingScene(lastSceneRef.current);
		if (!parsed) {
			return { appState: { viewBackgroundColor: "transparent" } };
		}
		return {
			elements: parsed.elements,
			appState: {
				...parsed.appState,
				viewBackgroundColor: "transparent",
				collaborators: new Map(),
			},
			files: parsed.files,
		};
		// The canvas is uncontrolled after mount; later scene changes flow
		// through updateScene in the effect below, never through initialData.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		setDarkTheme(isDarkSurface());
	}, []);

	useEffect(() => {
		const element = wrapperRef.current;
		if (!element || excalidrawModule) {
			return;
		}
		if (typeof IntersectionObserver === "undefined") {
			let cancelled = false;
			loadExcalidraw().then((mod) => {
				if (!cancelled) setExcalidrawModule(mod);
			});
			return () => {
				cancelled = true;
			};
		}
		let cancelled = false;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					observer.disconnect();
					loadExcalidraw().then((mod) => {
						if (!cancelled) setExcalidrawModule(mod);
					});
				}
			},
			{ rootMargin: "300px" },
		);
		observer.observe(element);
		return () => {
			cancelled = true;
			observer.disconnect();
		};
	}, [excalidrawModule]);

	useEffect(() => {
		if (!apiRef.current || scene === lastSceneRef.current) {
			return;
		}
		lastSceneRef.current = scene;
		const parsed = parseDrawingScene(scene);
		apiRef.current.updateScene({ elements: (parsed?.elements ?? []) as never });
		if (parsed && Object.keys(parsed.files).length > 0) {
			apiRef.current.addFiles(Object.values(parsed.files));
		}
	}, [scene]);

	const commitScene = useCallback((serialized: string) => {
		if (serialized === lastSceneRef.current) {
			return;
		}
		lastSceneRef.current = serialized;
		editorRef.current.updateBlock(blockRef.current, {
			type: "drawing",
			props: { scene: serialized },
		});
	}, []);

	const flushPendingCommit = useCallback(() => {
		if (pendingCommitRef.current === null) {
			return;
		}
		window.clearTimeout(pendingCommitRef.current);
		pendingCommitRef.current = null;
		const mod = moduleRef.current;
		const latest = latestChangeRef.current;
		latestChangeRef.current = null;
		if (!mod || !latest) {
			return;
		}
		commitScene(
			mod.serializeAsJSON(
				latest.elements as never,
				latest.appState as never,
				latest.files as never,
				"local",
			),
		);
	}, [commitScene]);

	const handleCanvasChange = useCallback(
		(elements: readonly unknown[], appState: unknown, files: unknown) => {
			const tool = (appState as { activeTool?: { type?: TToolType } } | null)?.activeTool
				?.type;
			if (tool) {
				setActiveTool(tool);
			}
			if (!activeRef.current || !editorRef.current.isEditable) {
				return;
			}
			latestChangeRef.current = { elements, appState, files };
			if (pendingCommitRef.current !== null) {
				window.clearTimeout(pendingCommitRef.current);
			}
			pendingCommitRef.current = window.setTimeout(() => {
				pendingCommitRef.current = null;
				const mod = moduleRef.current;
				const latest = latestChangeRef.current;
				latestChangeRef.current = null;
				if (!mod || !latest) {
					return;
				}
				commitScene(
					mod.serializeAsJSON(
						latest.elements as never,
						latest.appState as never,
						latest.files as never,
						"local",
					),
				);
			}, SCENE_COMMIT_DEBOUNCE_MS);
		},
		[commitScene],
	);

	const deactivate = useCallback(() => {
		flushPendingCommit();
		setActive(false);
		setFullscreen(false);
	}, [flushPendingCommit]);

	useEffect(() => {
		return () => {
			if (pendingCommitRef.current !== null) {
				window.clearTimeout(pendingCommitRef.current);
			}
		};
	}, []);

	useEffect(() => {
		if (!active) {
			return;
		}
		function onDocumentPointerDown(event: PointerEvent) {
			const element = wrapperRef.current;
			if (element && event.target instanceof Node && !element.contains(event.target)) {
				deactivate();
			}
		}
		document.addEventListener("pointerdown", onDocumentPointerDown, true);
		return () => document.removeEventListener("pointerdown", onDocumentPointerDown, true);
	}, [active, deactivate]);

	useEffect(() => {
		const element = wrapperRef.current;
		if (!element || !active) {
			return;
		}
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				if (fullscreenRef.current) {
					setFullscreen(false);
				} else {
					deactivate();
				}
				return;
			}
			// Drawing tool bindings are registered on `window` by the shared
			// shortcut system, so non-Escape keys must bubble out of the canvas.
		}
		function stopClipboardPropagation(event: Event) {
			event.stopPropagation();
		}
		element.addEventListener("keydown", onKeyDown);
		element.addEventListener("copy", stopClipboardPropagation);
		element.addEventListener("cut", stopClipboardPropagation);
		element.addEventListener("paste", stopClipboardPropagation);
		return () => {
			element.removeEventListener("keydown", onKeyDown);
			element.removeEventListener("copy", stopClipboardPropagation);
			element.removeEventListener("cut", stopClipboardPropagation);
			element.removeEventListener("paste", stopClipboardPropagation);
		};
	}, [active, deactivate]);

	function selectTool(tool: TToolType) {
		apiRef.current?.setActiveTool({ type: tool });
		setActiveTool(tool);
	}

	useShortcutScope(
		"drawing",
		{
			"drawing.selection": () => selectTool("selection"),
			"drawing.rectangle": () => selectTool("rectangle"),
			"drawing.diamond": () => selectTool("diamond"),
			"drawing.ellipse": () => selectTool("ellipse"),
			"drawing.arrow": () => selectTool("arrow"),
			"drawing.line": () => selectTool("line"),
			"drawing.freedraw": () => selectTool("freedraw"),
			"drawing.text": () => selectTool("text"),
			"drawing.image": () => selectTool("image"),
			"drawing.eraser": () => selectTool("eraser"),
		},
		{ active: active && editable },
	);

	function startToolbarDrag(event: React.PointerEvent) {
		const box = canvasBoxRef.current;
		if (!box) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		const bounds = box.getBoundingClientRect();
		let next = { x: toolbarPosition.x, y: toolbarPosition.y };

		function onMove(moveEvent: PointerEvent) {
			next = {
				x: clampFraction((moveEvent.clientX - bounds.left) / bounds.width),
				y: clampFraction((moveEvent.clientY - bounds.top) / bounds.height),
			};
			setDragToolbar(next);
		}
		function onUp() {
			document.removeEventListener("pointermove", onMove);
			document.removeEventListener("pointerup", onUp);
			setDragToolbar(null);
			editorRef.current.updateBlock(blockRef.current, {
				type: "drawing",
				props: { toolbarX: next.x, toolbarY: next.y },
			});
		}
		document.addEventListener("pointermove", onMove);
		document.addEventListener("pointerup", onUp);
	}

	function startHeightDrag(event: React.PointerEvent) {
		if (fullscreen || !editor.isEditable) {
			return;
		}
		event.preventDefault();
		const startY = event.clientY;
		const startHeight = dragHeight ?? storedHeight;
		let nextHeight = startHeight;

		function onMove(moveEvent: PointerEvent) {
			nextHeight = clampHeight(startHeight + (moveEvent.clientY - startY));
			setDragHeight(nextHeight);
		}
		function onUp() {
			document.removeEventListener("pointermove", onMove);
			document.removeEventListener("pointerup", onUp);
			setDragHeight(null);
			if (nextHeight !== storedHeight) {
				editorRef.current.updateBlock(blockRef.current, {
					type: "drawing",
					props: { height: nextHeight },
				});
			}
		}
		document.addEventListener("pointermove", onMove);
		document.addEventListener("pointerup", onUp);
	}

	const canvasHeight = dragHeight ?? storedHeight;
	const Excalidraw = excalidrawModule?.Excalidraw;

	return (
		<section
			ref={wrapperRef}
			contentEditable={false}
			className={cn(
				"group/drawing w-full",
				fullscreen ? "fixed inset-0 z-[200] flex flex-col bg-background" : "relative my-1",
			)}
		>
			<div
				ref={canvasBoxRef}
				className={cn("relative", fullscreen && "min-h-0 flex-1")}
				style={fullscreen ? undefined : { height: canvasHeight }}
			>
				{Excalidraw ? (
					<div className={cn("skriuw-drawing h-full", !active && "skriuw-drawing--idle")}>
						<Excalidraw
							excalidrawAPI={(api: unknown) => {
								apiRef.current = api as TExcalidrawAPI;
							}}
							initialData={initialData as never}
							onChange={handleCanvasChange as never}
							viewModeEnabled={!active || !editable}
							theme={darkTheme ? "dark" : "light"}
							UIOptions={UI_OPTIONS as never}
						/>
					</div>
				) : (
					<div className="flex h-full items-center justify-center text-xs text-muted-foreground/40">
						{elementCount > 0 ? "Loading drawing…" : "Click to draw"}
					</div>
				)}

				{!active && Excalidraw && elementCount === 0 ? (
					<p className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/40">
						Click to draw
					</p>
				) : null}

				{!active && Excalidraw ? (
					<button
						type="button"
						aria-label={editable ? "Edit drawing" : "Drawing (read-only)"}
						className="absolute inset-0 z-10 cursor-pointer bg-transparent"
						onMouseDown={(event) => event.preventDefault()}
						onClick={() => {
							if (editable) {
								setActive(true);
							}
						}}
					/>
				) : null}

				{active && editable && Excalidraw ? (
					<DrawingToolbar
						activeTool={activeTool}
						position={toolbarPosition}
						onSelectTool={selectTool}
						onDragStart={startToolbarDrag}
					/>
				) : null}

				<div
					className={cn(
						"absolute right-2 top-2 z-20 flex items-center gap-0.5 rounded-lg",
						"border border-border/60 bg-popover/70 p-1 shadow-md backdrop-blur-md",
						"opacity-0 transition-all duration-200 group-hover/drawing:opacity-100 focus-within:opacity-100",
						active
							? "opacity-100"
							: "translate-y-[-2px] group-hover/drawing:translate-y-0",
					)}
				>
					{editable ? (
						active ? (
							<ToolbarButton
								icon={CheckIcon}
								label="Done drawing"
								hint="Done (Esc)"
								onClick={deactivate}
							/>
						) : (
							<ToolbarButton
								icon={SprayCanIcon}
								label="Edit drawing"
								hint="Edit"
								onClick={() => setActive(true)}
							/>
						)
					) : null}
					<ToolbarButton
						icon={fullscreen ? ChevronsRightLeftIcon : MoveDiagonalIcon}
						label={fullscreen ? "Exit fullscreen" : "Edit fullscreen"}
						hint={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
						onClick={() => {
							if (fullscreen) {
								setFullscreen(false);
								return;
							}
							setFullscreen(true);
							if (editable) {
								setActive(true);
							}
						}}
					/>
				</div>
			</div>

			{!fullscreen && editable ? (
				<div
					role="separator"
					aria-orientation="horizontal"
					title="Drag to resize"
					onPointerDown={startHeightDrag}
					className="flex h-2 w-full cursor-row-resize items-center justify-center opacity-0 transition-opacity group-hover/drawing:opacity-100"
				>
					<div className="h-0.5 w-8 rounded-full bg-muted-foreground/30" />
				</div>
			) : null}
		</section>
	);
}

export const createDrawing = createReactBlockSpec(
	{
		type: "drawing",
		propSchema: {
			...defaultProps,
			scene: {
				default: DEFAULT_DRAWING_SCENE,
			},
			height: {
				default: DEFAULT_CANVAS_HEIGHT,
			},
			toolbarX: {
				default: DEFAULT_TOOLBAR_X,
			},
			toolbarY: {
				default: DEFAULT_TOOLBAR_Y,
			},
		},
		content: "none" as const,
	},
	{
		render: (props) => (
			<DrawingBlockView
				block={props.block as TDrawingBlockData}
				editor={props.editor as TDrawingEditor}
			/>
		),
		toExternalHTML: (props) => (
			<pre data-skriuw-drawing="true">
				<code className="language-excalidraw">
					{(props.block as TDrawingBlockData).props.scene ?? ""}
				</code>
			</pre>
		),
		parse: (element) => {
			if (!element.hasAttribute("data-skriuw-drawing")) {
				return undefined;
			}
			return { scene: element.textContent ?? "" };
		},
		runsBefore: ["fileTree"],
		meta: {
			isolating: true,
		},
	},
);
