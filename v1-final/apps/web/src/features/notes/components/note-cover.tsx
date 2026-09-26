"use client";

import { memo, useEffect, useImperativeHandle, useRef, useState } from "react";
import Image from "next/image";
import {
	Check,
	Expand,
	Image as ImageIcon,
	Loader2,
	MoveVertical,
	RefreshCw,
	Trash2,
	Upload,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@/shared/ui/context-menu";
import { Dialog, DialogContent, DialogTitle } from "@/shared/ui/dialog";
import { MorphingLabel } from "@/shared/ui/morphing-label";
import { cn } from "@/shared/lib/utils";
import { useWorkspaceBackend, useWorkspaceCapabilities } from "@/core/workspace-backend";
import type { CoverImage } from "@/core/workspace-backend";
import {
	VAULT_ASSET_PREFIX,
	compressCoverImage,
	resolveVaultAssetUrl,
} from "@/features/notes/lib/note-cover-image";
import { showUserToast } from "@/shared/lib/user-toast";

const NOTE_COVER_GRADIENTS: Record<string, string> = {
	slate: "linear-gradient(135deg, hsl(var(--project-gray) / 0.35), hsl(var(--muted) / 0.9))",
	crimson:
		"linear-gradient(135deg, hsl(var(--project-red) / 0.4), hsl(var(--project-orange) / 0.25))",
	sunset: "linear-gradient(135deg, hsl(var(--project-orange) / 0.4), hsl(var(--project-amber) / 0.25))",
	gold: "linear-gradient(135deg, hsl(var(--project-amber) / 0.4), hsl(var(--project-green) / 0.2))",
	meadow: "linear-gradient(135deg, hsl(var(--project-green) / 0.4), hsl(var(--project-teal) / 0.25))",
	lagoon: "linear-gradient(135deg, hsl(var(--project-teal) / 0.4), hsl(var(--project-blue) / 0.25))",
	ocean: "linear-gradient(135deg, hsl(var(--project-blue) / 0.4), hsl(var(--project-purple) / 0.2))",
	dusk: "linear-gradient(135deg, hsl(var(--project-purple) / 0.4), hsl(var(--project-pink) / 0.25))",
	bloom: "linear-gradient(135deg, hsl(var(--project-pink) / 0.4), hsl(var(--project-red) / 0.2))",
	ember: "linear-gradient(160deg, hsl(var(--project-red) / 0.45), hsl(var(--project-amber) / 0.2))",
	aurora: "linear-gradient(115deg, hsl(var(--project-green) / 0.35), hsl(var(--project-purple) / 0.3))",
	midnight:
		"linear-gradient(160deg, hsl(var(--project-blue) / 0.35), hsl(var(--project-gray) / 0.25))",
	orchid: "linear-gradient(115deg, hsl(var(--project-purple) / 0.4), hsl(var(--project-blue) / 0.25))",
	rose: "linear-gradient(160deg, hsl(var(--project-pink) / 0.45), hsl(var(--project-purple) / 0.2))",
	sage: "linear-gradient(115deg, hsl(var(--project-green) / 0.3), hsl(var(--project-gray) / 0.3))",
	storm: "linear-gradient(160deg, hsl(var(--project-gray) / 0.45), hsl(var(--project-blue) / 0.2))",
	flame: "linear-gradient(115deg, hsl(var(--project-orange) / 0.45), hsl(var(--project-pink) / 0.25))",
	tide: "linear-gradient(160deg, hsl(var(--project-teal) / 0.45), hsl(var(--project-green) / 0.2))",
};

const NOTE_COVER_SOLIDS: Record<string, string> = Object.fromEntries(
	["gray", "red", "orange", "amber", "green", "teal", "blue", "purple", "pink"].map((token) => [
		`solid-${token}`,
		`linear-gradient(hsl(var(--project-${token}) / 0.45), hsl(var(--project-${token}) / 0.45))`,
	]),
);

const NOTE_COVER_PRESETS: Record<string, string> = {
	...NOTE_COVER_GRADIENTS,
	...NOTE_COVER_SOLIDS,
};

const NOTE_COVER_COLORS: Record<string, string> = {
	gray: "hsl(var(--project-gray) / 0.45)",
	red: "hsl(var(--project-red) / 0.45)",
	orange: "hsl(var(--project-orange) / 0.45)",
	amber: "hsl(var(--project-amber) / 0.45)",
	green: "hsl(var(--project-green) / 0.45)",
	teal: "hsl(var(--project-teal) / 0.45)",
	blue: "hsl(var(--project-blue) / 0.45)",
	purple: "hsl(var(--project-purple) / 0.45)",
	pink: "hsl(var(--project-pink) / 0.45)",
};

const GRADIENT_PREFIX = "gradient:";
const COLOR_PREFIX = "color:";
/** Hexes are stored without `#` so the value can't collide with the position fragment markers. */
const CUSTOM_GRADIENT_PREFIX = "gradient-custom:";
const HEX_PATTERN = /^[0-9a-f]{6}$/i;
const POSITION_MARKER = "#y=";
const TRANSFORM_MARKER = "#cover-position=";
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const MAX_COVER_HEIGHT = 480;
// Lets the metadata picker hand off a just-uploaded cover to the banner editor.
const pendingCoverEdits = new Set<string>();

type CoverPosition = {
	x: number;
	y: number;
	zoom: number;
	/** Explicit pixel height. `null` keeps the responsive default. */
	height: number | null;
};

/**
 * The focal point and zoom ride along in a URL fragment, so editing needs no
 * schema change. The legacy `#y=NN` fragment remains readable.
 */
function splitCoverPosition(cover: string): { src: string; position: CoverPosition } {
	const transformIndex = cover.lastIndexOf(TRANSFORM_MARKER);
	if (transformIndex !== -1) {
		const [x, y, zoom, height] = cover
			.slice(transformIndex + TRANSFORM_MARKER.length)
			.split(",")
			.map(Number);
		if ([x, y, zoom].every(Number.isFinite)) {
			return {
				src: cover.slice(0, transformIndex),
				position: {
					x: Math.min(100, Math.max(0, x)),
					y: Math.min(100, Math.max(0, y)),
					zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)),
					height: Number.isFinite(height)
						? Math.min(MAX_COVER_HEIGHT, Math.max(0, Math.round(height)))
						: null,
				},
			};
		}
	}
	const index = cover.lastIndexOf(POSITION_MARKER);
	if (index === -1) {
		return { src: cover, position: { x: 50, y: 50, zoom: 1, height: null } };
	}
	const parsed = Number(cover.slice(index + POSITION_MARKER.length));
	return {
		src: cover.slice(0, index),
		position: {
			x: 50,
			y: Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 50,
			zoom: 1,
			height: null,
		},
	};
}

function withCoverPosition(cover: string, position: CoverPosition): string {
	const { src } = splitCoverPosition(cover);
	const x = Math.round(Math.min(100, Math.max(0, position.x)));
	const y = Math.round(Math.min(100, Math.max(0, position.y)));
	const zoom = Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, position.zoom)) * 100) / 100;
	const height =
		position.height === null
			? null
			: Math.round(Math.min(MAX_COVER_HEIGHT, Math.max(0, position.height)));
	return x === 50 && y === 50 && zoom === 1 && height === null
		? src
		: `${src}${TRANSFORM_MARKER}${x},${y},${zoom}${height === null ? "" : `,${height}`}`;
}

function isDecorativeCover(cover: string): boolean {
	return (
		cover.startsWith(GRADIENT_PREFIX) ||
		cover.startsWith(COLOR_PREFIX) ||
		cover.startsWith(CUSTOM_GRADIENT_PREFIX)
	);
}

function isImageCover(cover: string): boolean {
	return Boolean(cover) && !isDecorativeCover(cover);
}

function customGradientCss(value: string): string | null {
	const [from, to, angle] = value.split(",");
	if (!from || !to || !HEX_PATTERN.test(from) || !HEX_PATTERN.test(to)) return null;
	const degrees = Number(angle);
	const clamped = Number.isFinite(degrees) ? ((Math.round(degrees) % 360) + 360) % 360 : 135;
	return `linear-gradient(${clamped}deg, #${from}, #${to})`;
}

function resolveCoverStyle(src: string, y: number): React.CSSProperties {
	if (src.startsWith(GRADIENT_PREFIX)) {
		const gradient = NOTE_COVER_PRESETS[src.slice(GRADIENT_PREFIX.length)];
		return { backgroundImage: gradient ?? NOTE_COVER_GRADIENTS.slate };
	}
	if (src.startsWith(COLOR_PREFIX)) {
		const color = NOTE_COVER_COLORS[src.slice(COLOR_PREFIX.length)];
		return { backgroundColor: color ?? NOTE_COVER_COLORS.gray };
	}
	if (src.startsWith(CUSTOM_GRADIENT_PREFIX)) {
		const gradient = customGradientCss(src.slice(CUSTOM_GRADIENT_PREFIX.length));
		return gradient
			? { backgroundImage: gradient }
			: { backgroundImage: NOTE_COVER_GRADIENTS.slate };
	}
	return {
		backgroundImage: `url(${JSON.stringify(src)})`,
		backgroundSize: "cover",
		backgroundPosition: `center ${y}%`,
	};
}

/** Resolves a cover's image source to a displayable URL, awaiting `vault-asset:` blobs. */
function useResolvedCoverSrc(cover: string): string | null {
	const { src } = splitCoverPosition(cover);
	const [resolved, setResolved] = useState<string | null>(null);

	useEffect(() => {
		if (!src.startsWith(VAULT_ASSET_PREFIX)) {
			setResolved(null);
			return;
		}
		let cancelled = false;
		const result = resolveVaultAssetUrl(src);
		if (typeof result === "string") {
			if (result) setResolved(result);
			return;
		}
		result.then((url) => {
			if (!cancelled) setResolved(url);
		});
		return () => {
			cancelled = true;
		};
	}, [src]);

	if (!src) return null;
	if (src.startsWith(VAULT_ASSET_PREFIX)) return resolved;
	return src;
}

function useCoverStyle(cover: string, yOverride?: number | null): React.CSSProperties {
	const { src, position } = splitCoverPosition(cover);
	const resolvedSrc = useResolvedCoverSrc(cover);

	if (src.startsWith(VAULT_ASSET_PREFIX)) {
		return resolvedSrc
			? resolveCoverStyle(resolvedSrc, yOverride ?? position.y)
			: { backgroundColor: "hsl(var(--muted))" };
	}
	return resolveCoverStyle(src, yOverride ?? position.y);
}

type UploadStatus = "idle" | "pending" | "success";

/** Shared file-pick + compress + upload flow for the picker button and the banner context menu. */
function useCoverUpload(
	onCoverChange: (cover: string) => void,
	onDone?: () => void,
	onUploaded?: (cover: string) => void,
) {
	const [status, setStatus] = useState<UploadStatus>("idle");
	const fileInputRef = useRef<HTMLInputElement>(null);
	const backend = useWorkspaceBackend();
	const capabilities = useWorkspaceCapabilities();
	const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
		};
	}, []);

	async function uploadFile(file: File) {
		if (!backend.uploadCoverImage) return;

		setStatus("pending");
		try {
			const compressed = await compressCoverImage(file);
			const value = await backend.uploadCoverImage(compressed);
			onUploaded?.(value);
			onCoverChange(value);
			setStatus("success");
			doneTimerRef.current = setTimeout(() => {
				setStatus("idle");
				onDone?.();
			}, 900);
		} catch (error) {
			setStatus("idle");
			showUserToast(
				error instanceof Error ? error.message : "Couldn't upload cover image.",
				"error",
			);
		}
	}

	function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (file) void uploadFile(file);
	}

	return {
		status,
		fileInputRef,
		handleFileSelected,
		uploadFile,
		openFilePicker: () => fileInputRef.current?.click(),
		canUpload: Boolean(capabilities.coverUpload && backend.uploadCoverImage),
	};
}

type CoverUpload = ReturnType<typeof useCoverUpload>;

/** Upload flow for cover actions embedded in an external context menu (the editor body). */
export function useNoteCoverMenu(onCoverChange: (cover: string) => void): CoverUpload {
	return useCoverUpload(onCoverChange, undefined, (value) => pendingCoverEdits.add(value));
}

/** Hidden file input backing a cover upload; render it outside the menu so it survives menu close. */
export function NoteCoverUploadInput({ upload }: { upload: CoverUpload }) {
	return (
		<input
			ref={upload.fileInputRef}
			type="file"
			accept="image/png,image/jpeg,image/webp,image/gif"
			className="hidden"
			onChange={upload.handleFileSelected}
		/>
	);
}

type DragState = {
	pointerX: number;
	pointerY: number;
	startPosition: CoverPosition;
};

type ResizeState = {
	pointerY: number;
	startHeight: number;
};

/** Drag-to-reposition and drag-to-resize state machine backing the banner's edit chrome. */
function useCoverReposition({
	cover,
	savedPosition,
	onCoverChange,
	bannerRef,
}: {
	cover: string;
	savedPosition: CoverPosition;
	onCoverChange?: (cover: string) => void;
	bannerRef: React.RefObject<HTMLDivElement | null>;
}) {
	const [repositioning, setRepositioning] = useState(false);
	const [draftPosition, setDraftPosition] = useState<CoverPosition | null>(null);
	const [draftHeight, setDraftHeight] = useState<number | null>(null);
	const dragStateRef = useRef<DragState | null>(null);
	const resizeStateRef = useRef<ResizeState | null>(null);

	function startRepositioning() {
		setDraftPosition({ x: 50, y: 50, zoom: 1, height: null });
		setRepositioning(true);
	}

	function beginReposition() {
		setDraftPosition(savedPosition);
		setRepositioning(true);
	}

	function commitReposition() {
		setRepositioning(false);
		if (draftPosition) {
			onCoverChange?.(withCoverPosition(cover, draftPosition));
		}
		setDraftPosition(null);
	}

	function cancelReposition() {
		setRepositioning(false);
		setDraftPosition(null);
	}

	function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
		if (!repositioning) return;
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		dragStateRef.current = {
			pointerX: event.clientX,
			pointerY: event.clientY,
			startPosition: draftPosition ?? savedPosition,
		};
	}

	function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
		const drag = dragStateRef.current;
		const banner = bannerRef.current;
		if (!repositioning || !drag || !banner) return;
		const deltaX = ((event.clientX - drag.pointerX) / banner.clientWidth) * 100;
		const deltaY = ((event.clientY - drag.pointerY) / banner.clientHeight) * 100;
		// Dragging reveals the opposite edge of the image, so the focal point moves opposite.
		setDraftPosition({
			x: Math.min(100, Math.max(0, drag.startPosition.x - deltaX)),
			y: Math.min(100, Math.max(0, drag.startPosition.y - deltaY)),
			zoom: drag.startPosition.zoom,
			height: drag.startPosition.height,
		});
	}

	function handlePointerUp() {
		dragStateRef.current = null;
	}

	function beginResize(event: React.PointerEvent<HTMLButtonElement>) {
		const banner = bannerRef.current;
		if (!banner) return;
		event.preventDefault();
		event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
		resizeStateRef.current = { pointerY: event.clientY, startHeight: banner.clientHeight };
		setDraftHeight(banner.clientHeight);
	}

	function resizeCover(event: React.PointerEvent<HTMLButtonElement>) {
		const resize = resizeStateRef.current;
		if (!resize) return;
		setDraftHeight(
			Math.min(
				MAX_COVER_HEIGHT,
				Math.max(0, Math.round(resize.startHeight + event.clientY - resize.pointerY)),
			),
		);
	}

	function commitResize(event: React.PointerEvent<HTMLButtonElement>) {
		const resize = resizeStateRef.current;
		resizeStateRef.current = null;
		const height = resize
			? Math.min(
					MAX_COVER_HEIGHT,
					Math.max(0, Math.round(resize.startHeight + event.clientY - resize.pointerY)),
				)
			: draftHeight;
		if (height === null) return;
		onCoverChange?.(withCoverPosition(cover, { ...savedPosition, height }));
		setDraftHeight(null);
	}

	return {
		repositioning,
		draftPosition,
		setDraftPosition,
		draftHeight,
		startRepositioning,
		beginReposition,
		commitReposition,
		cancelReposition,
		handlePointerDown,
		handlePointerMove,
		handlePointerUp,
		beginResize,
		resizeCover,
		commitResize,
	};
}

/** Drop-an-image-onto-the-banner upload path; inert when the backend can't store uploads. */
function useCoverDrop(upload: CoverUpload, enabled: boolean) {
	const [dropActive, setDropActive] = useState(false);

	function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
		if (!enabled || !event.dataTransfer.types.includes("Files")) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = "copy";
		setDropActive(true);
	}

	function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
		if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
		setDropActive(false);
	}

	function handleDrop(event: React.DragEvent<HTMLDivElement>) {
		setDropActive(false);
		if (!enabled) return;
		const file = Array.from(event.dataTransfer.files).find((item) =>
			item.type.startsWith("image/"),
		);
		if (!file) return;
		event.preventDefault();
		void upload.uploadFile(file);
	}

	return { dropActive, handleDragOver, handleDragLeave, handleDrop };
}

type CoverDrop = ReturnType<typeof useCoverDrop>;

/**
 * Applies a just-uploaded cover's pending edit handoff during render, before
 * paint. Starts at `null` so a banner that mounts *because of* the upload
 * (first cover on a note) also picks up the handoff.
 */
function useCoverEditHandoff(cover: string, imageCover: boolean, onHandoff: () => void) {
	const prevCoverRef = useRef<string | null>(null);

	if (cover !== prevCoverRef.current) {
		prevCoverRef.current = cover;
		const { src } = splitCoverPosition(cover);
		if (imageCover && pendingCoverEdits.delete(src)) {
			onHandoff();
		}
	}
}

function CoverBannerImage({
	resolvedSrc,
	position,
}: {
	resolvedSrc: string;
	position: CoverPosition;
}) {
	return (
		<Image
			src={resolvedSrc}
			alt=""
			draggable={false}
			fill
			sizes="100vw"
			unoptimized
			className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
			style={{
				objectPosition: `${position.x}% ${position.y}%`,
				transform: `scale(${position.zoom})`,
				transformOrigin: `${position.x}% ${position.y}%`,
			}}
		/>
	);
}

function CoverRepositionToolbar({
	savedPosition,
	setDraftPosition,
	commitReposition,
	cancelReposition,
}: {
	savedPosition: CoverPosition;
	setDraftPosition: React.Dispatch<React.SetStateAction<CoverPosition | null>>;
	commitReposition: () => void;
	cancelReposition: () => void;
}) {
	return (
		<div className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-2">
			<span className="rounded-md bg-background/85 px-2 py-1 text-[11px] font-medium text-foreground shadow-sm backdrop-blur">
				Drag to reposition
			</span>
			<button
				type="button"
				aria-label="Zoom out"
				onPointerDown={(event) => event.stopPropagation()}
				onClick={() =>
					setDraftPosition((current) => ({
						...(current ?? savedPosition),
						zoom: Math.max(MIN_ZOOM, (current ?? savedPosition).zoom - 0.15),
					}))
				}
				className="rounded-md bg-background/85 p-1 text-foreground shadow-sm backdrop-blur hover:bg-background"
			>
				<ZoomOut className="h-3.5 w-3.5" />
			</button>
			<button
				type="button"
				aria-label="Zoom in"
				onPointerDown={(event) => event.stopPropagation()}
				onClick={() =>
					setDraftPosition((current) => ({
						...(current ?? savedPosition),
						zoom: Math.min(MAX_ZOOM, (current ?? savedPosition).zoom + 0.15),
					}))
				}
				className="rounded-md bg-background/85 p-1 text-foreground shadow-sm backdrop-blur hover:bg-background"
			>
				<ZoomIn className="h-3.5 w-3.5" />
			</button>
			<button
				type="button"
				onPointerDown={(event) => event.stopPropagation()}
				onClick={commitReposition}
				className="rounded-md bg-foreground px-2.5 py-1 text-[11px] font-medium text-background shadow-sm transition-colors hover:bg-foreground/90"
			>
				Save
			</button>
			<button
				type="button"
				onPointerDown={(event) => event.stopPropagation()}
				onClick={cancelReposition}
				className="rounded-md bg-background/85 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground"
			>
				Cancel
			</button>
		</div>
	);
}

function CoverResizeHandle({
	beginResize,
	resizeCover,
	commitResize,
}: {
	beginResize: (event: React.PointerEvent<HTMLButtonElement>) => void;
	resizeCover: (event: React.PointerEvent<HTMLButtonElement>) => void;
	commitResize: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
	return (
		<button
			type="button"
			aria-label="Drag to resize cover"
			onPointerDown={beginResize}
			onPointerMove={resizeCover}
			onPointerUp={commitResize}
			onPointerCancel={commitResize}
			className="group absolute inset-x-0 bottom-0 z-10 flex h-3 cursor-ns-resize items-end justify-center touch-none"
		>
			<span className="mb-0.5 h-0.5 w-8 rounded-full bg-foreground/0 transition-colors group-hover:bg-foreground/40" />
		</button>
	);
}

function CoverChangeIndicator({
	cover,
	onCoverChange,
}: {
	cover: string;
	onCoverChange: (cover: string) => void;
}) {
	return (
		<div
			className="absolute right-2.5 top-2.5 z-10 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
			onPointerDown={(event) => event.stopPropagation()}
		>
			<NoteCoverPicker
				cover={cover}
				onCoverChange={onCoverChange}
				renderTrigger={() => (
					<button
						type="button"
						aria-label="Change cover"
						className="flex items-center gap-1.5 rounded-full border border-border/50 bg-background/80 px-2.5 py-1.5 text-xs font-medium text-foreground/90 shadow-sm backdrop-blur-md transition-colors hover:border-border hover:bg-background hover:text-foreground"
					>
						<ImageIcon className="h-3.5 w-3.5" />
						Change cover
					</button>
				)}
			/>
		</div>
	);
}

function CoverBannerSurface({
	bannerRef,
	coverHeight,
	repositioning,
	handlePointerDown,
	handlePointerMove,
	handlePointerUp,
	imageCover,
	resolvedSrc,
	position,
	savedPosition,
	setDraftPosition,
	commitReposition,
	cancelReposition,
	cover,
	onCoverChange,
	beginResize,
	resizeCover,
	commitResize,
	style,
	drop,
	...rest
}: {
	bannerRef: React.RefObject<HTMLDivElement | null>;
	coverHeight: number | null;
	repositioning: boolean;
	handlePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
	handlePointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
	handlePointerUp: () => void;
	imageCover: boolean;
	resolvedSrc: string | null;
	position: CoverPosition;
	savedPosition: CoverPosition;
	setDraftPosition: React.Dispatch<React.SetStateAction<CoverPosition | null>>;
	commitReposition: () => void;
	cancelReposition: () => void;
	cover: string;
	onCoverChange?: (cover: string) => void;
	beginResize: (event: React.PointerEvent<HTMLButtonElement>) => void;
	resizeCover: (event: React.PointerEvent<HTMLButtonElement>) => void;
	commitResize: (event: React.PointerEvent<HTMLButtonElement>) => void;
	style: React.CSSProperties;
	drop?: CoverDrop;
	// ContextMenuTrigger asChild slots its handlers (onContextMenu, pointer
	// events) in as rest props; they must reach the DOM node and compose with
	// the banner's own pointer handlers or the right-click menu never opens.
} & React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			{...rest}
			ref={bannerRef}
			className={cn(
				"group relative h-32 w-full shrink-0 overflow-hidden border-b border-border md:h-40",
				coverHeight === 0 && "border-b-0",
				repositioning && "cursor-grab touch-none select-none active:cursor-grabbing",
				rest.className,
			)}
			style={style}
			onPointerDown={(event) => {
				rest.onPointerDown?.(event);
				handlePointerDown(event);
			}}
			onPointerMove={(event) => {
				rest.onPointerMove?.(event);
				handlePointerMove(event);
			}}
			onPointerUp={(event) => {
				rest.onPointerUp?.(event);
				handlePointerUp();
			}}
			onDragOver={drop?.handleDragOver}
			onDragLeave={drop?.handleDragLeave}
			onDrop={drop?.handleDrop}
		>
			{imageCover && resolvedSrc && (
				<CoverBannerImage resolvedSrc={resolvedSrc} position={position} />
			)}
			{drop?.dropActive && (
				<div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-ring bg-background/60 backdrop-blur-[2px]">
					<span className="rounded-md bg-background/85 px-2.5 py-1 text-xs font-medium text-foreground shadow-sm">
						Drop image to set cover
					</span>
				</div>
			)}
			{repositioning && (
				<CoverRepositionToolbar
					savedPosition={savedPosition}
					setDraftPosition={setDraftPosition}
					commitReposition={commitReposition}
					cancelReposition={cancelReposition}
				/>
			)}
			{onCoverChange && !repositioning && (
				<CoverChangeIndicator cover={cover} onCoverChange={onCoverChange} />
			)}
			{onCoverChange && coverHeight !== 0 && !repositioning && (
				<CoverResizeHandle
					beginResize={beginResize}
					resizeCover={resizeCover}
					commitResize={commitResize}
				/>
			)}
		</div>
	);
}

function CoverChangeSubmenu({
	onCoverChange,
	upload,
	label = "Change cover",
}: {
	onCoverChange: (cover: string) => void;
	upload: CoverUpload;
	label?: string;
}) {
	const [open, setOpen] = useState(false);
	const { gallery, galleryLoading, backend } = usePickerGallery(open);

	return (
		<ContextMenuSub onOpenChange={setOpen}>
			<ContextMenuSubTrigger>
				<ImageIcon className="mr-2 h-3.5 w-3.5" />
				{label}
			</ContextMenuSubTrigger>
			<ContextMenuSubContent className="w-[196px]">
				<div className="grid grid-cols-3 gap-1.5 p-1">
					{Object.entries(NOTE_COVER_GRADIENTS).map(([id, gradient]) => (
						<ContextMenuItem
							key={id}
							className="h-9 rounded-md border border-border p-0 focus:border-ring"
							style={{ backgroundImage: gradient }}
							aria-label={`Use ${id} cover gradient`}
							onSelect={() => onCoverChange(`${GRADIENT_PREFIX}${id}`)}
						/>
					))}
				</div>
				<div className="grid grid-cols-9 gap-1 p-1 pt-0">
					{Object.entries(NOTE_COVER_COLORS).map(([id, color]) => (
						<ContextMenuItem
							key={id}
							className="aspect-square rounded-sm border border-border p-0 focus:border-ring"
							style={{ backgroundColor: color }}
							aria-label={`Use ${id} cover color`}
							onSelect={() => onCoverChange(`${COLOR_PREFIX}${id}`)}
						/>
					))}
				</div>
				{backend.listCoverImages && (galleryLoading || gallery.length > 0) && (
					<>
						<ContextMenuSeparator />
						<p className="px-2 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">
							Your uploads
						</p>
						{galleryLoading ? (
							<div className="flex h-14 items-center justify-center text-muted-foreground">
								<Loader2 className="h-3.5 w-3.5 animate-spin" />
							</div>
						) : (
							<div className="grid max-h-40 grid-cols-3 gap-1.5 overflow-y-auto p-1">
								{gallery.slice(0, 9).map((image) => (
									<ContextMenuItem
										key={image}
										className="relative aspect-[3/2] overflow-hidden rounded-md border border-border p-0 focus:border-ring"
										aria-label="Use uploaded cover image"
										onSelect={() => onCoverChange(image)}
									>
										<CoverThumbImage
											src={image}
											sizes="(max-width: 260px) 33vw, 100px"
										/>
									</ContextMenuItem>
								))}
							</div>
						)}
					</>
				)}
				{upload.canUpload && (
					<>
						<ContextMenuSeparator />
						<ContextMenuItem onSelect={upload.openFilePicker}>
							<Upload className="mr-2 h-3.5 w-3.5" />
							Upload image…
						</ContextMenuItem>
					</>
				)}
			</ContextMenuSubContent>
		</ContextMenuSub>
	);
}

function CoverContextMenu({
	banner,
	repositioning,
	imageCover,
	resolvedSrc,
	onViewFullSize,
	onReposition,
	upload,
	onCoverChange,
}: {
	banner: React.ReactNode;
	repositioning: boolean;
	imageCover: boolean;
	resolvedSrc: string | null;
	onViewFullSize: () => void;
	onReposition: () => void;
	upload: CoverUpload;
	onCoverChange: (cover: string) => void;
}) {
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild disabled={repositioning}>
				{banner}
			</ContextMenuTrigger>
			<ContextMenuContent className="w-52">
				{imageCover && (
					<>
						<ContextMenuItem disabled={!resolvedSrc} onSelect={onViewFullSize}>
							<Expand className="mr-2 h-3.5 w-3.5" />
							View full size
						</ContextMenuItem>
						<ContextMenuItem onSelect={onReposition}>
							<MoveVertical className="mr-2 h-3.5 w-3.5" />
							Reposition
						</ContextMenuItem>
						<ContextMenuSeparator />
					</>
				)}
				<CoverChangeSubmenu onCoverChange={onCoverChange} upload={upload} />
				<ContextMenuSeparator />
				<ContextMenuItem
					className="text-[#ff808a] focus:bg-[#ff808a4d]"
					onSelect={() => onCoverChange("")}
				>
					<Trash2 className="mr-2 h-3.5 w-3.5" />
					Remove cover
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}

/**
 * Cover section for the editor body's context menu: an "Add cover" submenu
 * when the note has none, the full edit set (view, reposition, change,
 * remove) under a "Cover" submenu when it does.
 */
export function NoteCoverMenuItems({
	cover,
	onCoverChange,
	upload,
	onViewFullSize,
	onReposition,
}: {
	cover: string;
	onCoverChange: (cover: string) => void;
	upload: CoverUpload;
	onViewFullSize: () => void;
	onReposition: () => void;
}) {
	if (!cover) {
		return (
			<CoverChangeSubmenu label="Add cover" onCoverChange={onCoverChange} upload={upload} />
		);
	}
	return (
		<ContextMenuSub>
			<ContextMenuSubTrigger>
				<ImageIcon className="mr-2 h-3.5 w-3.5" />
				Cover
			</ContextMenuSubTrigger>
			<ContextMenuSubContent className="w-52">
				{isImageCover(cover) && (
					<>
						<ContextMenuItem onSelect={onViewFullSize}>
							<Expand className="mr-2 h-3.5 w-3.5" />
							View full size
						</ContextMenuItem>
						<ContextMenuItem onSelect={onReposition}>
							<MoveVertical className="mr-2 h-3.5 w-3.5" />
							Reposition
						</ContextMenuItem>
						<ContextMenuSeparator />
					</>
				)}
				<CoverChangeSubmenu onCoverChange={onCoverChange} upload={upload} />
				<ContextMenuSeparator />
				<ContextMenuItem
					className="text-[#ff808a] focus:bg-[#ff808a4d]"
					onSelect={() => onCoverChange("")}
				>
					<Trash2 className="mr-2 h-3.5 w-3.5" />
					Remove cover
				</ContextMenuItem>
			</ContextMenuSubContent>
		</ContextMenuSub>
	);
}

function CoverLightboxDialog({
	open,
	onOpenChange,
	resolvedSrc,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	resolvedSrc: string | null;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-[min(92vw,1200px)] border-border bg-background/95 p-2 backdrop-blur">
				<DialogTitle className="sr-only">Cover image</DialogTitle>
				{resolvedSrc && (
					<div className="relative h-[82vh]">
						<Image
							src={resolvedSrc}
							alt="Note cover"
							fill
							sizes="(max-width: 1200px) 92vw, 1200px"
							unoptimized
							className="rounded-sm object-contain"
						/>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

export type NoteCoverBannerHandle = {
	beginReposition: () => void;
	openLightbox: () => void;
};

type BannerProps = {
	cover: string;
	/** When provided, the banner becomes interactive: right-click menu, lightbox, reposition. */
	onCoverChange?: (cover: string) => void;
	/** Lets an external menu (the editor body's context menu) drive banner edit actions. */
	ref?: React.Ref<NoteCoverBannerHandle>;
};

export function NoteCoverBanner({ cover, onCoverChange, ref }: BannerProps) {
	const [lightboxOpen, setLightboxOpen] = useState(false);
	const bannerRef = useRef<HTMLDivElement>(null);
	const { position: savedPosition } = splitCoverPosition(cover);
	const {
		repositioning,
		draftPosition,
		setDraftPosition,
		draftHeight,
		startRepositioning,
		beginReposition,
		commitReposition,
		cancelReposition,
		handlePointerDown,
		handlePointerMove,
		handlePointerUp,
		beginResize,
		resizeCover,
		commitResize,
	} = useCoverReposition({ cover, savedPosition, onCoverChange, bannerRef });
	const position = repositioning ? (draftPosition ?? savedPosition) : savedPosition;
	const style = useCoverStyle(cover, repositioning ? position.y : null);
	const resolvedSrc = useResolvedCoverSrc(cover);
	const upload = useCoverUpload((value) => onCoverChange?.(value), undefined, startRepositioning);
	const drop = useCoverDrop(upload, Boolean(onCoverChange) && upload.canUpload && !repositioning);
	const imageCover = isImageCover(cover);

	useCoverEditHandoff(cover, imageCover, startRepositioning);

	useImperativeHandle(ref, () => ({
		beginReposition,
		openLightbox: () => setLightboxOpen(true),
	}));

	const coverHeight = draftHeight ?? savedPosition.height;
	const bannerStyle = {
		...(imageCover ? {} : style),
		...(coverHeight === null ? {} : { height: coverHeight }),
	};

	const banner = (
		<CoverBannerSurface
			bannerRef={bannerRef}
			coverHeight={coverHeight}
			repositioning={repositioning}
			handlePointerDown={handlePointerDown}
			handlePointerMove={handlePointerMove}
			handlePointerUp={handlePointerUp}
			imageCover={imageCover}
			resolvedSrc={resolvedSrc}
			position={position}
			savedPosition={savedPosition}
			setDraftPosition={setDraftPosition}
			commitReposition={commitReposition}
			cancelReposition={cancelReposition}
			cover={cover}
			onCoverChange={onCoverChange}
			beginResize={beginResize}
			resizeCover={resizeCover}
			commitResize={commitResize}
			style={bannerStyle}
			drop={drop}
		/>
	);

	if (!onCoverChange) {
		return banner;
	}

	return (
		<>
			<CoverContextMenu
				banner={banner}
				repositioning={repositioning}
				imageCover={imageCover}
				resolvedSrc={resolvedSrc}
				onViewFullSize={() => setLightboxOpen(true)}
				onReposition={beginReposition}
				upload={upload}
				onCoverChange={onCoverChange}
			/>

			<NoteCoverUploadInput upload={upload} />

			<CoverLightboxDialog
				open={lightboxOpen}
				onOpenChange={setLightboxOpen}
				resolvedSrc={resolvedSrc}
			/>
		</>
	);
}

function usePickerGallery(open: boolean) {
	const [gallery, setGallery] = useState<string[]>([]);
	const [galleryLoading, setGalleryLoading] = useState(false);
	const backend = useWorkspaceBackend();

	useEffect(() => {
		if (!open || !backend.listCoverImages) return;
		let cancelled = false;
		setGalleryLoading(true);
		backend
			.listCoverImages()
			.then((images) => {
				if (!cancelled) setGallery(images);
			})
			.catch(() => {
				// The picker remains usable when a storage provider cannot list objects.
			})
			.finally(() => {
				if (!cancelled) setGalleryLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [backend, open]);

	return { gallery, setGallery, galleryLoading, backend };
}

function GradientGrid({
	cover,
	onSelect,
	presets = NOTE_COVER_GRADIENTS,
}: {
	cover?: string;
	onSelect: (value: string) => void;
	presets?: Record<string, string>;
}) {
	return (
		<div className="grid grid-cols-3 gap-1.5">
			{Object.entries(presets).map(([id, gradient]) => {
				const value = `${GRADIENT_PREFIX}${id}`;
				const selected = cover === value;
				return (
					<button
						key={id}
						type="button"
						aria-label={`Use ${id} cover gradient`}
						onClick={() => onSelect(value)}
						className={cn(
							"relative h-10 rounded-md border transition-colors",
							selected
								? "border-ring ring-1 ring-ring"
								: "border-border hover:border-ring/60",
						)}
						style={{ backgroundImage: gradient }}
					>
						{selected && (
							<Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-foreground drop-shadow-sm" />
						)}
					</button>
				);
			})}
		</div>
	);
}

function ColorGrid({ cover, onSelect }: { cover?: string; onSelect: (value: string) => void }) {
	return (
		<div className="grid grid-cols-9 gap-1">
			{Object.entries(NOTE_COVER_COLORS).map(([id, color]) => {
				const value = `${COLOR_PREFIX}${id}`;
				const selected = cover === value;
				return (
					<button
						key={id}
						type="button"
						aria-label={`Use ${id} cover color`}
						onClick={() => onSelect(value)}
						className={cn(
							"relative aspect-square rounded-sm border transition-colors",
							selected
								? "border-ring ring-1 ring-ring"
								: "border-border hover:border-ring/60",
						)}
						style={{ backgroundColor: color }}
					>
						{selected && (
							<Check className="absolute inset-0 m-auto h-3 w-3 text-foreground drop-shadow-sm" />
						)}
					</button>
				);
			})}
		</div>
	);
}

function PickerCustomGradientSection({ onSelect }: { onSelect: (value: string) => void }) {
	const [from, setFrom] = useState("#6366f1");
	const [to, setTo] = useState("#ec4899");
	const [angle, setAngle] = useState(135);
	const value = `${CUSTOM_GRADIENT_PREFIX}${from.slice(1)},${to.slice(1)},${angle}`;

	return (
		<>
			<p className="mb-1.5 mt-3 px-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">
				Custom gradient
			</p>
			<div className="flex items-center gap-1.5">
				<input
					type="color"
					value={from}
					onChange={(event) => setFrom(event.target.value)}
					aria-label="Gradient start color"
					className="h-7 w-9 shrink-0 cursor-pointer rounded-md border border-border bg-background p-0.5"
				/>
				<input
					type="color"
					value={to}
					onChange={(event) => setTo(event.target.value)}
					aria-label="Gradient end color"
					className="h-7 w-9 shrink-0 cursor-pointer rounded-md border border-border bg-background p-0.5"
				/>
				<input
					type="range"
					min={0}
					max={360}
					step={15}
					value={angle}
					onChange={(event) => setAngle(Number(event.target.value))}
					aria-label="Gradient angle"
					className="min-w-0 flex-1 accent-foreground"
				/>
			</div>
			<button
				type="button"
				onClick={() => onSelect(value)}
				className="mt-1.5 flex h-7 w-full items-center justify-center rounded-md border border-border text-xs font-medium text-foreground transition-colors hover:border-ring/60"
				style={{
					backgroundImage:
						customGradientCss(value.slice(CUSTOM_GRADIENT_PREFIX.length)) ?? undefined,
				}}
			>
				<span className="rounded bg-background/70 px-1.5 py-0.5 backdrop-blur-sm">
					Use gradient
				</span>
			</button>
		</>
	);
}

/** Sets the cover from an image pasted while the picker is open; text paste is untouched. */
function usePickerPaste(open: boolean, upload: CoverUpload) {
	const uploadRef = useRef(upload);
	uploadRef.current = upload;

	useEffect(() => {
		if (!open) return;
		function handlePaste(event: ClipboardEvent) {
			if (!uploadRef.current.canUpload) return;
			const file = Array.from(event.clipboardData?.files ?? []).find((item) =>
				item.type.startsWith("image/"),
			);
			if (!file) return;
			event.preventDefault();
			void uploadRef.current.uploadFile(file);
		}
		window.addEventListener("paste", handlePaste);
		return () => window.removeEventListener("paste", handlePaste);
	}, [open]);
}

function PickerUploadSection({ upload }: { upload: CoverUpload }) {
	return (
		<>
			<p className="mb-1.5 mt-3 px-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">
				Upload
			</p>
			<NoteCoverUploadInput upload={upload} />
			<button
				type="button"
				onClick={upload.openFilePicker}
				disabled={upload.status !== "idle"}
				className={cn(
					"flex h-7 w-full items-center justify-center overflow-hidden rounded-md border text-xs font-medium transition-all duration-[350ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
					upload.status === "success"
						? "border-emerald-500/50 bg-emerald-500/15 text-emerald-500"
						: "border-border text-foreground hover:bg-muted",
					upload.status === "pending" && "cursor-default opacity-80",
				)}
			>
				<MorphingLabel
					activeKey={upload.status}
					framePadding="px-3"
					frames={[
						{
							key: "idle",
							content: (
								<>
									<Upload className="h-3 w-3" />
									Upload image…
								</>
							),
						},
						{
							key: "pending",
							content: (
								<>
									<Loader2 className="h-3 w-3 animate-spin" />
									Uploading…
								</>
							),
						},
						{
							key: "success",
							content: (
								<>
									<Check className="h-3 w-3" />
									Cover set
								</>
							),
						},
					]}
				/>
			</button>
		</>
	);
}

/** Renders a cover image thumbnail, resolving `vault-asset:` refs to blob URLs first. */
function CoverThumbImage({ src, sizes }: { src: string; sizes: string }) {
	const resolvedSrc = useResolvedCoverSrc(src);
	if (!resolvedSrc) {
		return <span className="absolute inset-0 bg-muted" />;
	}
	return (
		<Image
			src={resolvedSrc}
			alt=""
			fill
			sizes={sizes}
			unoptimized
			className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
		/>
	);
}

function PickerGallerySection({
	gallery,
	galleryLoading,
	onSelect,
	onBrowseLibrary,
}: {
	gallery: string[];
	galleryLoading: boolean;
	onSelect: (image: string) => void;
	onBrowseLibrary?: () => void;
}) {
	return (
		<>
			<div className="mb-1.5 mt-3 flex items-center justify-between px-0.5">
				<p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">
					Your uploads
				</p>
				{onBrowseLibrary && (
					<button
						type="button"
						onClick={onBrowseLibrary}
						className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
					>
						Browse all…
					</button>
				)}
			</div>
			{galleryLoading ? (
				<div className="flex h-16 items-center justify-center rounded-md border border-border text-muted-foreground">
					<Loader2 className="h-3.5 w-3.5 animate-spin" />
				</div>
			) : gallery.length > 0 ? (
				<div className="grid max-h-40 grid-cols-3 gap-1.5 overflow-y-auto pr-0.5">
					{gallery.slice(0, 9).map((image) => (
						<button
							key={image}
							type="button"
							onClick={() => onSelect(image)}
							className="group relative aspect-[3/2] overflow-hidden rounded-md border border-border transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
							aria-label="Use uploaded cover image"
						>
							<CoverThumbImage src={image} sizes="(max-width: 260px) 33vw, 100px" />
						</button>
					))}
				</div>
			) : (
				<p className="px-0.5 text-xs text-muted-foreground">No uploaded images yet.</p>
			)}
		</>
	);
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB"];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function formatUploadDate(ms?: number): string | null {
	if (!ms) return null;
	return new Date(ms).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

type LibrarySort = "newest" | "oldest" | "largest";

const LIBRARY_SORTS: Array<{ id: LibrarySort; label: string }> = [
	{ id: "newest", label: "Newest" },
	{ id: "oldest", label: "Oldest" },
	{ id: "largest", label: "Largest" },
];

function sortLibraryImages(images: CoverImage[], sort: LibrarySort): CoverImage[] {
	const sorted = [...images];
	if (sort === "largest") {
		sorted.sort((left, right) => right.size - left.size);
	} else {
		const direction = sort === "newest" ? -1 : 1;
		sorted.sort(
			(left, right) => direction * ((left.uploadedAt ?? 0) - (right.uploadedAt ?? 0)),
		);
	}
	return sorted;
}

/** Counts how many notes use each uploaded image as their cover, keyed by cover src. */
function useCoverUsage(open: boolean): Map<string, number> {
	const [usage, setUsage] = useState<Map<string, number>>(new Map());
	const backend = useWorkspaceBackend();

	useEffect(() => {
		const listNotes = backend.listNotes;
		if (!open || !listNotes) return;
		let cancelled = false;
		listNotes()
			.then((notes) => {
				if (cancelled) return;
				const counts = new Map<string, number>();
				for (const note of notes) {
					if (!note.cover || !isImageCover(note.cover)) continue;
					const { src } = splitCoverPosition(note.cover);
					counts.set(src, (counts.get(src) ?? 0) + 1);
				}
				setUsage(counts);
			})
			.catch(() => {
				// Usage badges are decorative; the library works without them.
			});
		return () => {
			cancelled = true;
		};
	}, [backend, open]);

	return usage;
}

function LibraryDeleteButton({
	usageCount,
	armed,
	deleting,
	onArm,
	onDelete,
	className,
}: {
	usageCount: number;
	armed: boolean;
	deleting: boolean;
	onArm: () => void;
	onDelete: () => void;
	className?: string;
}) {
	return (
		<button
			type="button"
			onClick={() => (armed ? onDelete() : onArm())}
			disabled={deleting}
			className={cn(
				"flex items-center gap-1 rounded-md p-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
				armed
					? "bg-destructive text-destructive-foreground"
					: "bg-black/40 text-white/90 hover:bg-destructive hover:text-destructive-foreground",
				className,
			)}
			aria-label={armed ? "Confirm delete cover image" : "Delete cover image"}
		>
			{deleting ? (
				<Loader2 className="size-3.5 animate-spin" />
			) : (
				<Trash2 className="size-3.5" />
			)}
			{armed && (usageCount > 0 ? `Used by ${usageCount} — delete?` : "Delete?")}
		</button>
	);
}

function LibraryPreviewDialog({
	image,
	usageCount,
	onClose,
	onUse,
	onDelete,
	canDelete,
	deleting,
}: {
	image: CoverImage | null;
	usageCount: number;
	onClose: () => void;
	onUse: (image: CoverImage) => void;
	onDelete: (image: CoverImage) => void;
	canDelete: boolean;
	deleting: boolean;
}) {
	const resolvedSrc = useResolvedCoverSrc(image?.url ?? "");
	const [armed, setArmed] = useState(false);

	useEffect(() => {
		setArmed(false);
	}, [image?.pathname]);

	const meta = image
		? [
				formatBytes(image.size),
				formatUploadDate(image.uploadedAt),
				usageCount > 0 && `Used by ${usageCount} note${usageCount === 1 ? "" : "s"}`,
			]
				.filter(Boolean)
				.join(" · ")
		: "";

	return (
		<Dialog open={image !== null} onOpenChange={(next) => !next && onClose()}>
			<DialogContent className="max-w-[min(94vw,1100px)] border-border bg-background/95 backdrop-blur">
				<DialogTitle className="sr-only">Cover image preview</DialogTitle>
				{image && (
					<>
						<div className="relative h-[70vh] overflow-hidden rounded-md bg-muted/30">
							{resolvedSrc && (
								<Image
									src={resolvedSrc}
									alt="Cover image preview"
									fill
									sizes="(max-width: 1100px) 94vw, 1100px"
									unoptimized
									className="object-contain"
								/>
							)}
						</div>
						<div className="flex items-center justify-between gap-3">
							<span className="truncate text-xs text-muted-foreground">{meta}</span>
							<div className="flex shrink-0 items-center gap-1.5">
								{canDelete && (
									<button
										type="button"
										onClick={() => (armed ? onDelete(image) : setArmed(true))}
										disabled={deleting}
										className={cn(
											"flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
											armed
												? "border-destructive bg-destructive text-destructive-foreground"
												: "border-border text-muted-foreground hover:border-destructive/50 hover:text-destructive",
										)}
									>
										{deleting ? (
											<Loader2 className="size-3.5 animate-spin" />
										) : (
											<Trash2 className="size-3.5" />
										)}
										{armed ? "Really delete?" : "Delete"}
									</button>
								)}
								<button
									type="button"
									onClick={() => onUse(image)}
									className="flex h-7 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background transition-colors hover:bg-foreground/90"
								>
									<ImageIcon className="size-3.5" />
									Use as cover
								</button>
							</div>
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}

/**
 * Full media-library overview of every uploaded cover image: sortable grid
 * with size/date/usage metadata, full-size preview, upload, and deletion
 * (armed two-step button instead of a nested confirm dialog).
 */
function CoverLibraryDialog({
	open,
	onOpenChange,
	onSelect,
	onDeleted,
	onUploaded,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSelect: (image: string) => void;
	onDeleted: (image: string) => void;
	onUploaded: (image: string) => void;
}) {
	const backend = useWorkspaceBackend();
	const [images, setImages] = useState<CoverImage[]>([]);
	const [loading, setLoading] = useState(false);
	const [sort, setSort] = useState<LibrarySort>("newest");
	const [preview, setPreview] = useState<CoverImage | null>(null);
	const [armedDelete, setArmedDelete] = useState<string | null>(null);
	const [deleting, setDeleting] = useState<string | null>(null);
	const usage = useCoverUsage(open);
	const upload = useCoverUpload(onSelect, undefined, (value) => {
		pendingCoverEdits.add(value);
		onUploaded(value);
	});

	const [refreshTick, setRefreshTick] = useState(0);

	useEffect(() => {
		if (!open || !backend.listCoverImagesDetailed) return;
		let cancelled = false;
		setLoading(true);
		setArmedDelete(null);
		backend
			.listCoverImagesDetailed()
			.then((rows) => {
				if (!cancelled) setImages(rows);
			})
			.catch(() => {
				if (!cancelled) showUserToast("Couldn't load your cover images.", "error");
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [backend, open, refreshTick]);

	async function deleteImage(image: CoverImage) {
		if (!backend.deleteCoverImage) return;
		setDeleting(image.pathname);
		try {
			await backend.deleteCoverImage(image);
			setImages((current) => current.filter((row) => row.pathname !== image.pathname));
			if (preview?.pathname === image.pathname) setPreview(null);
			onDeleted(image.url);
		} catch {
			showUserToast("Couldn't delete this image.", "error");
		} finally {
			setDeleting(null);
			setArmedDelete(null);
		}
	}

	const sorted = sortLibraryImages(images, sort);
	const totalBytes = images.reduce((sum, image) => sum + image.size, 0);

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="max-w-[min(94vw,1080px)]">
					<div className="flex flex-wrap items-center justify-between gap-3 pr-6">
						<div className="flex items-baseline gap-2">
							<DialogTitle>Image library</DialogTitle>
							{images.length > 0 && (
								<span className="text-xs text-muted-foreground">
									{images.length} image{images.length === 1 ? "" : "s"} ·{" "}
									{formatBytes(totalBytes)}
								</span>
							)}
						</div>
						<div className="flex items-center gap-1.5">
							<div className="flex items-center rounded-md border border-border p-0.5">
								{LIBRARY_SORTS.map(({ id, label }) => (
									<button
										key={id}
										type="button"
										onClick={() => setSort(id)}
										className={cn(
											"rounded-[5px] px-2 py-1 text-[11px] font-medium transition-colors",
											sort === id
												? "bg-muted text-foreground"
												: "text-muted-foreground hover:text-foreground",
										)}
									>
										{label}
									</button>
								))}
							</div>
							<button
								type="button"
								onClick={() => setRefreshTick((tick) => tick + 1)}
								disabled={loading}
								aria-label="Refresh image library"
								className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
							>
								<RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
							</button>
							{upload.canUpload && (
								<button
									type="button"
									onClick={upload.openFilePicker}
									disabled={upload.status !== "idle"}
									className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
								>
									{upload.status === "pending" ? (
										<Loader2 className="size-3.5 animate-spin" />
									) : (
										<Upload className="size-3.5" />
									)}
									Upload
								</button>
							)}
						</div>
					</div>

					{loading && images.length === 0 ? (
						<div className="flex h-56 items-center justify-center text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
						</div>
					) : images.length === 0 ? (
						<div className="flex h-56 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
							<ImageIcon className="size-6" />
							No uploaded images yet.
							{upload.canUpload && (
								<button
									type="button"
									onClick={upload.openFilePicker}
									className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
								>
									<Upload className="size-3.5" />
									Upload your first image
								</button>
							)}
						</div>
					) : (
						<div className="grid max-h-[68vh] grid-cols-2 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
							{sorted.map((image) => {
								const armed = armedDelete === image.pathname;
								const usageCount = usage.get(image.url) ?? 0;
								const date = formatUploadDate(image.uploadedAt);
								return (
									<div
										key={image.pathname}
										className="group relative aspect-[3/2] overflow-hidden rounded-lg border border-border transition-colors hover:border-ring"
									>
										<button
											type="button"
											onClick={() => onSelect(image.url)}
											className="block h-full w-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
											aria-label="Use this cover image"
										>
											<CoverThumbImage
												src={image.url}
												sizes="(max-width: 1080px) 50vw, 260px"
											/>
										</button>
										{usageCount > 0 && (
											<span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-sm">
												In use{usageCount > 1 ? ` ×${usageCount}` : ""}
											</span>
										)}
										<div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-8 opacity-0 transition-opacity group-hover:opacity-100">
											<span className="truncate text-[11px] font-medium text-white/90">
												{formatBytes(image.size)}
												{date ? ` · ${date}` : ""}
											</span>
											<span className="flex shrink-0 items-center gap-1">
												<button
													type="button"
													onClick={() => setPreview(image)}
													className="pointer-events-auto rounded-md bg-black/40 p-1.5 text-white/90 transition-colors hover:bg-black/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
													aria-label="View full size"
												>
													<Expand className="size-3.5" />
												</button>
												{backend.deleteCoverImage && (
													<LibraryDeleteButton
														usageCount={usageCount}
														armed={armed}
														deleting={deleting === image.pathname}
														onArm={() => setArmedDelete(image.pathname)}
														onDelete={() => deleteImage(image)}
														className="pointer-events-auto"
													/>
												)}
											</span>
										</div>
									</div>
								);
							})}
						</div>
					)}
					<NoteCoverUploadInput upload={upload} />
				</DialogContent>
			</Dialog>

			<LibraryPreviewDialog
				image={preview}
				usageCount={preview ? (usage.get(preview.url) ?? 0) : 0}
				onClose={() => setPreview(null)}
				onUse={(image) => {
					setPreview(null);
					onSelect(image.url);
				}}
				onDelete={deleteImage}
				canDelete={Boolean(backend.deleteCoverImage)}
				deleting={preview !== null && deleting === preview.pathname}
			/>
		</>
	);
}

function PickerUrlRow({
	url,
	setUrl,
	applyUrl,
}: {
	url: string;
	setUrl: (value: string) => void;
	applyUrl: () => void;
}) {
	return (
		<>
			<p className="mb-1.5 mt-3 px-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">
				Image URL
			</p>
			<div className="flex items-center gap-1.5">
				<input
					value={url}
					onChange={(event) => setUrl(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") applyUrl();
					}}
					placeholder="Paste image URL…"
					aria-label="Cover image URL"
					className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring"
				/>
				<button
					type="button"
					onClick={applyUrl}
					disabled={!url.trim()}
					className="h-7 shrink-0 rounded-md border border-border px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
				>
					Set
				</button>
			</div>
		</>
	);
}

type PickerProps = {
	cover?: string;
	onCoverChange: (cover: string) => void;
	/** Overrides the default swatch/icon trigger button, e.g. for a banner overlay. */
	renderTrigger?: (cover: string | undefined) => React.ReactNode;
};

export const NoteCoverPicker = memo(function NoteCoverPicker({
	cover,
	onCoverChange,
	renderTrigger,
}: PickerProps) {
	const [open, setOpen] = useState(false);
	const [libraryOpen, setLibraryOpen] = useState(false);
	const [url, setUrl] = useState("");
	const { gallery, setGallery, galleryLoading, backend } = usePickerGallery(open);
	const upload = useCoverUpload(
		onCoverChange,
		() => setOpen(false),
		(value) => {
			pendingCoverEdits.add(value);
			setGallery((images) => [value, ...images.filter((image) => image !== value)]);
		},
	);
	const triggerStyle = useCoverStyle(cover ?? "");

	usePickerPaste(open, upload);

	function applyUrl() {
		const trimmed = url.trim();
		if (!trimmed) return;
		onCoverChange(trimmed);
		setUrl("");
		setOpen(false);
	}

	function selectCover(value: string) {
		onCoverChange(value);
		setOpen(false);
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				{renderTrigger ? (
					renderTrigger(cover)
				) : (
					<button
						type="button"
						className={cn(
							"flex h-8 w-8 items-center justify-center rounded-md transition-colors",
							cover
								? "hover:bg-accent"
								: "text-muted-foreground hover:bg-accent hover:text-foreground",
						)}
						aria-label={cover ? "Change cover" : "Add cover"}
					>
						{cover ? (
							<span
								className="h-4 w-6 rounded-sm border border-border/60"
								style={triggerStyle}
							/>
						) : (
							<ImageIcon className="h-4 w-4" />
						)}
					</button>
				)}
			</PopoverTrigger>
			<PopoverContent className="w-[260px] p-2.5" align="start" side="bottom">
				<div className="max-h-[min(70vh,520px)] overflow-y-auto pr-0.5">
					<p className="mb-1.5 px-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">
						Gradient
					</p>
					<GradientGrid cover={cover} onSelect={selectCover} />

					<p className="mb-1.5 mt-3 px-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">
						Color
					</p>
					<ColorGrid cover={cover} onSelect={selectCover} />

					<PickerCustomGradientSection onSelect={selectCover} />

					{upload.canUpload && <PickerUploadSection upload={upload} />}

					{backend.listCoverImages && (
						<PickerGallerySection
							gallery={gallery}
							galleryLoading={galleryLoading}
							onSelect={selectCover}
							onBrowseLibrary={
								backend.listCoverImagesDetailed
									? () => {
											setOpen(false);
											setLibraryOpen(true);
										}
									: undefined
							}
						/>
					)}

					<PickerUrlRow url={url} setUrl={setUrl} applyUrl={applyUrl} />
				</div>
			</PopoverContent>

			{backend.listCoverImagesDetailed && (
				<CoverLibraryDialog
					open={libraryOpen}
					onOpenChange={setLibraryOpen}
					onSelect={(image) => {
						setLibraryOpen(false);
						selectCover(image);
					}}
					onDeleted={(image) =>
						setGallery((images) => images.filter((entry) => entry !== image))
					}
					onUploaded={(image) => {
						setLibraryOpen(false);
						setGallery((images) => [
							image,
							...images.filter((entry) => entry !== image),
						]);
					}}
				/>
			)}
		</Popover>
	);
});
