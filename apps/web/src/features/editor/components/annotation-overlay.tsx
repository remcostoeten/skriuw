"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Eraser, MousePointer2, Pencil } from "lucide-react";
import { useUpdateNote } from "@/features/notes/hooks/use-update-note";
import { countDrawingElements, parseDrawingScene } from "@/shared/lib/drawing";
import { cn } from "@/shared/lib/utils";
import "@excalidraw/excalidraw/index.css";
import "./block-specs/drawing.css";

type TExcalidrawModule = typeof import("@excalidraw/excalidraw");

type TAnnotationTool = "freedraw" | "eraser" | "selection";

type TExcalidrawAPI = {
	updateScene: (scene: { elements?: readonly unknown[]; appState?: unknown }) => void;
	addFiles: (files: unknown[]) => void;
	setActiveTool: (tool: { type: TAnnotationTool }) => void;
};

type Props = {
	noteId: string;
	scene?: string;
	active: boolean;
	readOnly: boolean;
	onDone: () => void;
};

const COMMIT_DEBOUNCE_MS = 600;

const TOOLS: Array<{ type: TAnnotationTool; icon: typeof Pencil; label: string }> = [
	{ type: "freedraw", icon: Pencil, label: "Draw" },
	{ type: "eraser", icon: Eraser, label: "Erase" },
	{ type: "selection", icon: MousePointer2, label: "Select" },
];

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
	const [activeTool, setActiveTool] = useState<TAnnotationTool>("freedraw");

	moduleRef.current = excalidrawModule;
	activeRef.current = active;

	const { mutate: mutateNote } = useUpdateNote();
	const mutateRef = useRef(mutateNote);
	mutateRef.current = mutateNote;

	const elementCount = useMemo(() => countDrawingElements(scene), [scene]);
	const shouldRender = active || elementCount > 0;

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
				activeTool?: { type?: TAnnotationTool };
			} | null;
			const tool = state?.activeTool?.type;
			if (tool && TOOLS.some((entry) => entry.type === tool)) {
				setActiveTool(tool);
			}
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

	useEffect(() => {
		const wrapper = wrapperRef.current;
		if (!wrapper || !active) {
			return;
		}
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				onDone();
				return;
			}
			event.stopPropagation();
		}
		wrapper.addEventListener("keydown", onKeyDown);
		return () => wrapper.removeEventListener("keydown", onKeyDown);
	}, [active, onDone]);

	function selectTool(tool: TAnnotationTool) {
		apiRef.current?.setActiveTool({ type: tool });
		setActiveTool(tool);
	}

	if (!shouldRender) {
		return null;
	}

	const Excalidraw = excalidrawModule?.Excalidraw;

	return (
		<div
			ref={wrapperRef}
			data-annotation-overlay={active ? "active" : "idle"}
			contentEditable={false}
			className={cn(
				"absolute inset-0 z-30",
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
							window.setTimeout(() => {
								apiRef.current?.setActiveTool({ type: "freedraw" });
							}, 0);
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
					className={cn(
						"absolute left-1/2 top-3 z-40 flex -translate-x-1/2 items-center gap-0.5",
						"rounded-lg border border-border/60 bg-popover/85 p-1 shadow-md backdrop-blur-md",
					)}
					onPointerDown={(event) => event.stopPropagation()}
				>
					{TOOLS.map((tool) => {
						const Icon = tool.icon;
						const selected = activeTool === tool.type;
						return (
							<button
								key={tool.type}
								type="button"
								aria-label={tool.label}
								aria-pressed={selected}
								title={tool.label}
								className={cn(
									"flex h-7 w-7 items-center justify-center rounded-md transition-colors",
									"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
									selected
										? "bg-foreground/12 text-foreground"
										: "text-muted-foreground/70 hover:bg-foreground/8 hover:text-foreground",
								)}
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => selectTool(tool.type)}
							>
								<Icon size={15} className="pointer-events-none" />
							</button>
						);
					})}
					<div className="mx-0.5 h-4 w-px bg-border/70" />
					<button
						type="button"
						aria-label="Done annotating"
						title="Done (Esc)"
						className={cn(
							"flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium",
							"text-muted-foreground/80 transition-colors hover:bg-foreground/8 hover:text-foreground",
							"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
						)}
						onMouseDown={(event) => event.preventDefault()}
						onClick={onDone}
					>
						<Check size={13} className="pointer-events-none" />
						Done
					</button>
				</div>
			) : null}
		</div>
	);
}
