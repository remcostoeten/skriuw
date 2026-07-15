"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Eraser, Highlighter, MousePointer2, Pencil } from "lucide-react";
import {
	getShortcutDefaultKeys,
	useShortcutHint,
	useShortcutManager,
	type ShortcutId,
} from "@/core/shortcuts";
import {
	ANNOTATION_COLORS,
	ANNOTATION_SIZES,
	DEFAULT_BRUSH,
	getAnnotationColor,
	getAnnotationSize,
	resolveBrush,
	resolveColorHex,
	stepSize,
	type TAnnotationTool,
	type TBrush,
} from "@/features/editor/lib/annotation-brush";
import { useUpdateNote } from "@/features/notes/hooks/use-update-note";
import { countDrawingElements, parseDrawingScene } from "@/shared/lib/drawing";
import { cn } from "@/shared/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import "@excalidraw/excalidraw/index.css";
import "./block-specs/drawing.css";

type TExcalidrawModule = typeof import("@excalidraw/excalidraw");

type TExcalidrawAPI = {
	updateScene: (scene: { elements?: readonly unknown[]; appState?: unknown }) => void;
	addFiles: (files: unknown[]) => void;
	setActiveTool: (tool: { type: string }) => void;
};

type Props = {
	noteId: string;
	scene?: string;
	active: boolean;
	readOnly: boolean;
	onDone: () => void;
};

const COMMIT_DEBOUNCE_MS = 600;

const TOOLS: Array<{
	type: TAnnotationTool;
	icon: typeof Pencil;
	label: string;
	shortcutId?: ShortcutId;
	hint?: string;
}> = [
	{ type: "pen", icon: Pencil, label: "Draw", shortcutId: "drawing.freedraw" },
	{ type: "highlighter", icon: Highlighter, label: "Highlight", hint: "H" },
	{ type: "eraser", icon: Eraser, label: "Erase", shortcutId: "drawing.eraser" },
	{ type: "selection", icon: MousePointer2, label: "Select", shortcutId: "drawing.selection" },
];

/**
 * Single-character binding for a tool shortcut, honoring a user remap. Combos
 * with modifiers are ignored: the overlay only claims bare keys.
 */
function boundKey(id: ShortcutId, override?: string): string | null {
	const resolved = override ?? getShortcutDefaultKeys(id);
	const combo = Array.isArray(resolved) ? resolved[0] : resolved;
	return combo.length === 1 ? combo.toLowerCase() : null;
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

function AnnotationTooltip({
	label,
	shortcutId,
	hint,
	children,
}: {
	label: string;
	shortcutId?: ShortcutId;
	hint?: string;
	children: React.ReactNode;
}) {
	const registered = useShortcutHint(shortcutId);

	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent
				side="bottom"
				className="px-2 py-1 text-xs"
				shortcut={registered ?? hint}
			>
				{label}
			</TooltipContent>
		</Tooltip>
	);
}

/**
 * Full-pane freehand layer drawn over the whole note ("annotate mode").
 *
 * The canvas stays viewport-sized while the strokes live in document
 * coordinates: Excalidraw's scrollY is slaved to the editor's scrollTop, so
 * ink stays glued to the content it was drawn over while scrolling, without
 * allocating a canvas as tall as the note.
 */
export function AnnotationOverlay({ noteId, scene = "", active, readOnly, onDone }: Props) {
	const wrapperRef = useRef<HTMLDivElement | null>(null);
	const toolbarRef = useRef<HTMLDivElement | null>(null);
	const scrollElRef = useRef<HTMLElement | null>(null);
	const apiRef = useRef<TExcalidrawAPI | null>(null);
	const moduleRef = useRef<TExcalidrawModule | null>(null);
	const activeRef = useRef(active);
	const lastSceneRef = useRef(scene);
	const pendingCommitRef = useRef<number | null>(null);
	const viewportResetFrameRef = useRef<number | null>(null);
	const latestChangeRef = useRef<{
		elements: readonly unknown[];
		appState: unknown;
		files: unknown;
	} | null>(null);

	const [excalidrawModule, setExcalidrawModule] = useState<TExcalidrawModule | null>(null);
	const [darkTheme, setDarkTheme] = useState(true);
	const [brush, setBrush] = useState<TBrush>(DEFAULT_BRUSH);
	const [rovingIndex, setRovingIndex] = useState(0);

	const brushRef = useRef(brush);
	brushRef.current = brush;
	moduleRef.current = excalidrawModule;
	activeRef.current = active;

	const { mutate: mutateNote } = useUpdateNote();
	const mutateRef = useRef(mutateNote);
	mutateRef.current = mutateNote;

	const { bindings } = useShortcutManager();
	const toolKeys = useMemo(() => {
		const map = new Map<string, TAnnotationTool>();
		for (const tool of TOOLS) {
			if (!tool.shortcutId) continue;
			const key = boundKey(tool.shortcutId, bindings[tool.shortcutId]);
			if (key) map.set(key, tool.type);
		}
		return map;
	}, [bindings]);
	const toolKeysRef = useRef(toolKeys);
	toolKeysRef.current = toolKeys;

	const elementCount = useMemo(() => countDrawingElements(scene), [scene]);
	const shouldRender = active || elementCount > 0;
	const resolved = useMemo(() => resolveBrush(brush, darkTheme), [brush, darkTheme]);
	const resolvedRef = useRef(resolved);
	resolvedRef.current = resolved;

	const desiredScrollY = useCallback(() => -(scrollElRef.current?.scrollTop ?? 0), []);

	const initialData = useMemo(() => {
		const parsed = parseDrawingScene(lastSceneRef.current);
		return {
			elements: parsed?.elements ?? [],
			appState: {
				viewBackgroundColor: "transparent",
				collaborators: new Map(),
				scrollX: 0,
				scrollY: desiredScrollY(),
				zoom: { value: 1 },
			},
			files: parsed?.files,
		};
		// Uncontrolled after mount; later scene changes flow through updateScene.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		setDarkTheme(isDarkSurface());
	}, []);

	useEffect(() => {
		if (!shouldRender || excalidrawModule) {
			return;
		}
		let cancelled = false;
		loadExcalidraw().then((mod) => {
			if (!cancelled) setExcalidrawModule(mod);
		});
		return () => {
			cancelled = true;
		};
	}, [shouldRender, excalidrawModule]);

	const syncViewport = useCallback(() => {
		if (viewportResetFrameRef.current !== null) {
			return;
		}
		viewportResetFrameRef.current = requestAnimationFrame(() => {
			viewportResetFrameRef.current = null;
			apiRef.current?.updateScene({
				appState: { scrollX: 0, scrollY: desiredScrollY(), zoom: { value: 1 } },
			});
		});
	}, [desiredScrollY]);

	const applyBrush = useCallback(() => {
		const api = apiRef.current;
		if (!api) {
			return;
		}
		const next = resolvedRef.current;
		api.setActiveTool({ type: next.excalidrawTool });
		// Only inking tools carry stroke settings; pushing appState for the eraser
		// or selection would echo back through onChange for no reason.
		if (next.excalidrawTool === "freedraw") {
			api.updateScene({
				appState: {
					currentItemStrokeColor: next.strokeColor,
					currentItemStrokeWidth: next.strokeWidth,
					currentItemOpacity: next.opacity,
				},
			});
		}
	}, []);

	useEffect(() => {
		if (!active) {
			return;
		}
		applyBrush();
	}, [active, applyBrush, brush.tool, brush.colorId, brush.sizeId, darkTheme]);

	useEffect(() => {
		const wrapper = wrapperRef.current;
		if (!wrapper || !shouldRender) {
			return;
		}
		const scrollEl = wrapper.parentElement?.querySelector<HTMLElement>("[data-editor-scroll]");
		scrollElRef.current = scrollEl ?? null;
		if (!scrollEl) {
			return;
		}
		function onScroll() {
			syncViewport();
		}
		scrollEl.addEventListener("scroll", onScroll, { passive: true });
		syncViewport();
		return () => {
			scrollEl.removeEventListener("scroll", onScroll);
			scrollElRef.current = null;
		};
	}, [shouldRender, syncViewport]);

	// While annotating the canvas owns pointer events, so route the wheel to the
	// editor's scroll container ourselves — otherwise Excalidraw pans its own
	// viewport away from the note.
	useEffect(() => {
		const wrapper = wrapperRef.current;
		if (!wrapper || !active) {
			return;
		}
		function onWheel(event: WheelEvent) {
			event.preventDefault();
			event.stopPropagation();
			if (!event.ctrlKey && scrollElRef.current) {
				scrollElRef.current.scrollTop += event.deltaY;
			}
		}
		wrapper.addEventListener("wheel", onWheel, { passive: false });
		return () => wrapper.removeEventListener("wheel", onWheel);
	}, [active]);

	const commitScene = useCallback(
		(serialized: string) => {
			if (serialized === lastSceneRef.current) {
				return;
			}
			lastSceneRef.current = serialized;
			mutateRef.current({ id: noteId, annotationScene: serialized });
		},
		[noteId],
	);

	const serializeLatest = useCallback((): string | null => {
		const mod = moduleRef.current;
		const latest = latestChangeRef.current;
		latestChangeRef.current = null;
		if (!mod || !latest) {
			return null;
		}
		const liveElements = latest.elements.filter(
			(element) => !(element as { isDeleted?: boolean } | null)?.isDeleted,
		);
		if (liveElements.length === 0) {
			return "";
		}
		return mod.serializeAsJSON(
			latest.elements as never,
			latest.appState as never,
			latest.files as never,
			"local",
		);
	}, []);

	const flushPendingCommit = useCallback(() => {
		if (pendingCommitRef.current === null) {
			return;
		}
		window.clearTimeout(pendingCommitRef.current);
		pendingCommitRef.current = null;
		const serialized = serializeLatest();
		if (serialized !== null) {
			commitScene(serialized);
		}
	}, [commitScene, serializeLatest]);

	const handleCanvasChange = useCallback(
		(elements: readonly unknown[], appState: unknown, files: unknown) => {
			const state = appState as {
				scrollX?: number;
				scrollY?: number;
				zoom?: { value?: number };
			} | null;
			// The brush is never read back from `appState`: onChange reports the tool
			// as it was *before* the change, so feeding it into state ping-pongs
			// forever (eraser -> pen -> eraser). The overlay owns the tool instead,
			// and the key handler below stops Excalidraw's own bindings from ever
			// changing it behind our back.
			//
			// The annotation space is pinned: zoom 1, x 0, y following the editor
			// scroll. Anything else (pinch, space-drag, hand tool) is snapped back.
			if (
				state &&
				(Math.abs(state.scrollX ?? 0) > 0.5 ||
					Math.abs((state.scrollY ?? 0) - desiredScrollY()) > 0.5 ||
					Math.abs((state.zoom?.value ?? 1) - 1) > 0.001)
			) {
				syncViewport();
			}
			if (!activeRef.current || readOnly) {
				return;
			}
			latestChangeRef.current = { elements, appState, files };
			if (pendingCommitRef.current !== null) {
				window.clearTimeout(pendingCommitRef.current);
			}
			pendingCommitRef.current = window.setTimeout(() => {
				pendingCommitRef.current = null;
				const serialized = serializeLatest();
				if (serialized !== null) {
					commitScene(serialized);
				}
			}, COMMIT_DEBOUNCE_MS);
		},
		[commitScene, desiredScrollY, readOnly, serializeLatest, syncViewport],
	);

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

	useEffect(() => {
		if (active) {
			return;
		}
		flushPendingCommit();
	}, [active, flushPendingCommit]);

	useEffect(() => {
		return () => {
			flushPendingCommit();
			if (viewportResetFrameRef.current !== null) {
				cancelAnimationFrame(viewportResetFrameRef.current);
			}
		};
		// Flush only on unmount; mid-life flushes are handled by the effects above.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Entering annotate mode from the editor toolbar leaves focus on that button,
	// outside the overlay — move it in so the canvas key handling below is live.
	useEffect(() => {
		if (!active || readOnly) {
			return;
		}
		wrapperRef.current?.focus({ preventScroll: true });
	}, [active, readOnly]);

	// Excalidraw claims digits, `h` and the bracket keys on a capture-phase
	// document listener and stops them there, so a listener on the overlay would
	// never see them. Capturing on `window` runs ahead of that and lets us keep
	// the keys for the brush. The remaining tool keys stay on the shared shortcut
	// scope below, which listens on `window` and needs them to bubble.
	useEffect(() => {
		const wrapper = wrapperRef.current;
		if (!wrapper || !active) {
			return;
		}
		const overlay = wrapper;
		function ownsFocus() {
			const focused = document.activeElement;
			return !focused || focused === document.body || overlay.contains(focused);
		}
		function onKeyDown(event: KeyboardEvent) {
			if (!ownsFocus()) {
				return;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				onDone();
				return;
			}
			if (readOnly || event.metaKey || event.ctrlKey || event.altKey) {
				return;
			}
			const color = ANNOTATION_COLORS.find((entry) => entry.key === event.key);
			if (color) {
				event.preventDefault();
				event.stopPropagation();
				setBrush((current) => ({ ...current, colorId: color.id }));
				return;
			}
			const key = event.key.toLowerCase();
			if (key === "h") {
				event.preventDefault();
				event.stopPropagation();
				setBrush((current) => ({ ...current, tool: "highlighter" }));
				return;
			}
			const tool = toolKeysRef.current.get(key);
			if (tool) {
				event.preventDefault();
				event.stopPropagation();
				setBrush((current) => ({ ...current, tool }));
				return;
			}
			if (event.key === "[" || event.key === "]") {
				event.preventDefault();
				event.stopPropagation();
				const direction = event.key === "]" ? 1 : -1;
				setBrush((current) => ({
					...current,
					sizeId: stepSize(current.sizeId, direction),
				}));
				return;
			}
			// Annotate mode exposes four tools; every other bare key is one of
			// Excalidraw's own tool bindings (r, o, a, t, …) and would put the canvas
			// on a shape the toolbar can't represent. Swallow them. Modifier combos
			// (undo/redo) and named keys (arrows, Delete, Tab) still pass through.
			if (event.key.length === 1) {
				event.preventDefault();
				event.stopPropagation();
			}
		}
		window.addEventListener("keydown", onKeyDown, { capture: true });
		return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
	}, [active, onDone, readOnly]);

	function selectTool(tool: TAnnotationTool) {
		setBrush((current) => ({ ...current, tool }));
	}

	function moveRovingFocus(event: React.KeyboardEvent<HTMLDivElement>) {
		if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
			return;
		}
		const items = Array.from(
			event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-toolbar-item]"),
		);
		if (items.length === 0) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		const current = items.findIndex((item) => item === document.activeElement);
		const from = current === -1 ? rovingIndex : current;
		const next =
			event.key === "Home"
				? 0
				: event.key === "End"
					? items.length - 1
					: (from + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
		setRovingIndex(next);
		items[next].focus();
	}

	if (!shouldRender) {
		return null;
	}

	const Excalidraw = excalidrawModule?.Excalidraw;
	const inkable = brush.tool === "pen" || brush.tool === "highlighter";
	const activeColor = getAnnotationColor(brush.colorId);
	const activeSize = getAnnotationSize(brush.sizeId);
	const activeToolLabel = TOOLS.find((tool) => tool.type === brush.tool)?.label ?? "";
	let itemIndex = -1;

	function toolbarItemProps() {
		itemIndex += 1;
		const index = itemIndex;
		return {
			"data-toolbar-item": "",
			tabIndex: index === rovingIndex ? 0 : -1,
			onFocus: () => setRovingIndex(index),
		} as const;
	}

	return (
		<div
			ref={wrapperRef}
			data-annotation-overlay={active ? "active" : "idle"}
			contentEditable={false}
			tabIndex={active ? -1 : undefined}
			className={cn(
				"absolute inset-0 z-30 outline-none",
				active ? "pointer-events-auto" : "pointer-events-none",
			)}
		>
			{Excalidraw ? (
				<div className="skriuw-drawing h-full">
					<Excalidraw
						excalidrawAPI={(api: unknown) => {
							apiRef.current = api as TExcalidrawAPI;
							syncViewport();
							// Deferred: Excalidraw resets to "selection" during its own
							// mount, which would clobber a synchronous setActiveTool.
							window.setTimeout(applyBrush, 0);
						}}
						initialData={initialData as never}
						onChange={handleCanvasChange as never}
						viewModeEnabled={!active || readOnly}
						theme={darkTheme ? "dark" : "light"}
					/>
				</div>
			) : null}

			{active ? (
				<div
					ref={toolbarRef}
					role="toolbar"
					aria-label="Annotation tools"
					aria-orientation="horizontal"
					onKeyDown={moveRovingFocus}
					className={cn(
						"absolute left-1/2 top-3 z-40 flex -translate-x-1/2 items-center gap-0.5",
						"rounded-lg border border-border/60 bg-popover/85 p-1 shadow-md backdrop-blur-md",
					)}
					onPointerDown={(event) => event.stopPropagation()}
				>
					{TOOLS.map((tool) => {
						const Icon = tool.icon;
						const selected = brush.tool === tool.type;
						return (
							<AnnotationTooltip
								key={tool.type}
								label={tool.label}
								shortcutId={tool.shortcutId}
								hint={tool.hint}
							>
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
									onClick={() => selectTool(tool.type)}
									{...toolbarItemProps()}
								>
									<Icon size={15} className="pointer-events-none" />
								</button>
							</AnnotationTooltip>
						);
					})}

					<div className="mx-0.5 h-4 w-px bg-border/70" />

					<div
						role="radiogroup"
						aria-label="Ink color"
						className="flex items-center gap-0.5"
					>
						{ANNOTATION_COLORS.map((color) => {
							const selected = brush.colorId === color.id;
							const hex = resolveColorHex(color.id, darkTheme);
							return (
								<AnnotationTooltip
									key={color.id}
									label={color.label}
									hint={color.key}
								>
									<button
										type="button"
										role="radio"
										aria-label={color.label}
										aria-checked={selected}
										disabled={!inkable}
										className={cn(
											"flex h-7 w-7 items-center justify-center rounded-md transition-colors",
											"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
											"disabled:cursor-not-allowed disabled:opacity-40",
											selected && "bg-foreground/12",
										)}
										onMouseDown={(event) => event.preventDefault()}
										onClick={() =>
											setBrush((current) => ({
												...current,
												colorId: color.id,
											}))
										}
										{...toolbarItemProps()}
									>
										<span
											className={cn(
												"pointer-events-none h-3.5 w-3.5 rounded-full ring-1 ring-inset ring-black/20",
												selected && "ring-2 ring-foreground/70",
											)}
											style={{
												backgroundColor: hex,
												opacity: brush.tool === "highlighter" ? 0.55 : 1,
											}}
										/>
									</button>
								</AnnotationTooltip>
							);
						})}
					</div>

					<div className="mx-0.5 h-4 w-px bg-border/70" />

					<div
						role="radiogroup"
						aria-label="Stroke size"
						className="flex items-center gap-0.5"
					>
						{ANNOTATION_SIZES.map((size) => {
							const selected = brush.sizeId === size.id;
							return (
								<AnnotationTooltip
									key={size.id}
									label={size.label}
									hint={size.id === "s" ? "[" : size.id === "l" ? "]" : undefined}
								>
									<button
										type="button"
										role="radio"
										aria-label={`${size.label} stroke`}
										aria-checked={selected}
										disabled={!inkable}
										className={cn(
											"flex h-7 w-7 items-center justify-center rounded-md transition-colors",
											"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
											"disabled:cursor-not-allowed disabled:opacity-40",
											selected
												? "bg-foreground/12 text-foreground"
												: "text-muted-foreground/70 hover:bg-foreground/8",
										)}
										onMouseDown={(event) => event.preventDefault()}
										onClick={() =>
											setBrush((current) => ({ ...current, sizeId: size.id }))
										}
										{...toolbarItemProps()}
									>
										<span
											className="pointer-events-none rounded-full bg-current"
											style={{ height: size.dot, width: size.dot }}
										/>
									</button>
								</AnnotationTooltip>
							);
						})}
					</div>

					<div className="mx-0.5 h-4 w-px bg-border/70" />

					<AnnotationTooltip label="Done" hint="Esc">
						<button
							type="button"
							aria-label="Done annotating"
							className={cn(
								"flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium",
								"text-muted-foreground/80 transition-colors hover:bg-foreground/8 hover:text-foreground",
								"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
							)}
							onMouseDown={(event) => event.preventDefault()}
							onClick={onDone}
							{...toolbarItemProps()}
						>
							<Check size={13} className="pointer-events-none" />
							Done
						</button>
					</AnnotationTooltip>

					<span aria-live="polite" className="sr-only">
						{inkable
							? `${activeToolLabel}, ${activeColor.label}, ${activeSize.label}`
							: activeToolLabel}
					</span>
				</div>
			) : null}
		</div>
	);
}
