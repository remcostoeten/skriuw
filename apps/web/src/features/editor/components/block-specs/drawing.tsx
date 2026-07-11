"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultProps } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { Check, Maximize2, Minimize2, Pencil } from "lucide-react";
import {
	countDrawingElements,
	DEFAULT_DRAWING_SCENE,
	parseDrawingScene,
} from "@/shared/lib/drawing";
import { cn } from "@/shared/lib/utils";
import "@excalidraw/excalidraw/index.css";
import "./drawing.css";

type TExcalidrawModule = typeof import("@excalidraw/excalidraw");

type TExcalidrawAPI = {
	updateScene: (scene: { elements?: readonly unknown[] }) => void;
	addFiles: (files: unknown[]) => void;
};

type TDrawingBlockData = {
	props: {
		scene?: string;
		height?: number;
	};
};

type TDrawingEditor = {
	isEditable?: boolean;
	updateBlock: (
		block: unknown,
		update: { type: "drawing"; props: { scene?: string; height?: number } },
	) => void;
};

const SCENE_COMMIT_DEBOUNCE_MS = 500;
const MIN_CANVAS_HEIGHT = 180;
const MAX_CANVAS_HEIGHT = 1200;
const DEFAULT_CANVAS_HEIGHT = 400;

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

const HEADER_ICON_BUTTON =
	"flex h-6 w-6 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-foreground/8 hover:text-foreground";

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

	blockRef.current = block;
	editorRef.current = editor;
	moduleRef.current = excalidrawModule;
	activeRef.current = active;
	fullscreenRef.current = fullscreen;

	const elementCount = useMemo(() => countDrawingElements(scene), [scene]);

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
			event.stopPropagation();
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
	const editable = editor.isEditable !== false;
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

				<div
					className={cn(
						"absolute right-1.5 top-1.5 z-20 flex items-center gap-0.5 rounded-md",
						"bg-popover/80 p-0.5 shadow-sm backdrop-blur-sm",
						"opacity-0 transition-opacity group-hover/drawing:opacity-100 focus-within:opacity-100",
						active && "opacity-100",
					)}
				>
					{editable ? (
						active ? (
							<button
								type="button"
								className={HEADER_ICON_BUTTON}
								aria-label="Done drawing"
								title="Done (Esc)"
								onMouseDown={(event) => event.preventDefault()}
								onClick={deactivate}
							>
								<Check className="h-3.5 w-3.5" strokeWidth={1.8} />
							</button>
						) : (
							<button
								type="button"
								className={HEADER_ICON_BUTTON}
								aria-label="Edit drawing"
								title="Edit"
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => setActive(true)}
							>
								<Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
							</button>
						)
					) : null}
					<button
						type="button"
						className={HEADER_ICON_BUTTON}
						aria-label={fullscreen ? "Exit fullscreen" : "Edit fullscreen"}
						title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
						onMouseDown={(event) => event.preventDefault()}
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
					>
						{fullscreen ? (
							<Minimize2 className="h-3.5 w-3.5" strokeWidth={1.8} />
						) : (
							<Maximize2 className="h-3.5 w-3.5" strokeWidth={1.8} />
						)}
					</button>
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
