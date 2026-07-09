"use client";

import { memo, useEffect, useRef, useState } from "react";
import {
	Check,
	Expand,
	Image as ImageIcon,
	Loader2,
	MoveVertical,
	Trash2,
	Upload,
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
};

const GRADIENT_PREFIX = "gradient:";
const POSITION_MARKER = "#y=";

/**
 * The vertical focal point rides along in the cover string as a `#y=NN`
 * fragment (0–100, percent from the top), so repositioning needs no schema
 * change on any backend — fragments are inert in URLs and vault tokens alike.
 */
function splitCoverPosition(cover: string): { src: string; y: number } {
	const index = cover.lastIndexOf(POSITION_MARKER);
	if (index === -1) return { src: cover, y: 50 };
	const parsed = Number(cover.slice(index + POSITION_MARKER.length));
	return {
		src: cover.slice(0, index),
		y: Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 50,
	};
}

function withCoverPosition(cover: string, y: number): string {
	const { src } = splitCoverPosition(cover);
	const rounded = Math.round(Math.min(100, Math.max(0, y)));
	return rounded === 50 ? src : `${src}${POSITION_MARKER}${rounded}`;
}

function isImageCover(cover: string): boolean {
	return Boolean(cover) && !cover.startsWith(GRADIENT_PREFIX);
}

function resolveCoverStyle(src: string, y: number): React.CSSProperties {
	if (src.startsWith(GRADIENT_PREFIX)) {
		const gradient = NOTE_COVER_GRADIENTS[src.slice(GRADIENT_PREFIX.length)];
		return { backgroundImage: gradient ?? NOTE_COVER_GRADIENTS.slate };
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
	const { src, y } = splitCoverPosition(cover);
	const resolvedSrc = useResolvedCoverSrc(cover);

	if (src.startsWith(VAULT_ASSET_PREFIX)) {
		return resolvedSrc
			? resolveCoverStyle(resolvedSrc, yOverride ?? y)
			: { backgroundColor: "hsl(var(--muted))" };
	}
	return resolveCoverStyle(src, yOverride ?? y);
}

type UploadStatus = "idle" | "pending" | "success";

/** Shared file-pick + compress + upload flow for the picker button and the banner context menu. */
function useCoverUpload(onCoverChange: (cover: string) => void, onDone?: () => void) {
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

	async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file || !backend.uploadCoverImage) return;

		setStatus("pending");
		try {
			const compressed = await compressCoverImage(file);
			const value = await backend.uploadCoverImage(compressed);
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

	return {
		status,
		fileInputRef,
		handleFileSelected,
		openFilePicker: () => fileInputRef.current?.click(),
		canUpload: Boolean(capabilities.coverUpload && backend.uploadCoverImage),
	};
}

type BannerProps = {
	cover: string;
	/** When provided, the banner becomes interactive: right-click menu, lightbox, reposition. */
	onCoverChange?: (cover: string) => void;
};

export function NoteCoverBanner({ cover, onCoverChange }: BannerProps) {
	const [repositioning, setRepositioning] = useState(false);
	const [draftY, setDraftY] = useState<number | null>(null);
	const [lightboxOpen, setLightboxOpen] = useState(false);
	const dragStateRef = useRef<{ pointerY: number; startY: number } | null>(null);
	const bannerRef = useRef<HTMLDivElement>(null);
	const style = useCoverStyle(cover, repositioning ? draftY : null);
	const resolvedSrc = useResolvedCoverSrc(cover);
	const upload = useCoverUpload((value) => onCoverChange?.(value));
	const { y: savedY } = splitCoverPosition(cover);
	const imageCover = isImageCover(cover);

	function beginReposition() {
		setDraftY(savedY);
		setRepositioning(true);
	}

	function commitReposition() {
		setRepositioning(false);
		if (draftY !== null && Math.round(draftY) !== savedY) {
			onCoverChange?.(withCoverPosition(cover, draftY));
		}
		setDraftY(null);
	}

	function cancelReposition() {
		setRepositioning(false);
		setDraftY(null);
	}

	function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
		if (!repositioning) return;
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		dragStateRef.current = { pointerY: event.clientY, startY: draftY ?? savedY };
	}

	function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
		const drag = dragStateRef.current;
		const banner = bannerRef.current;
		if (!repositioning || !drag || !banner) return;
		const deltaPercent = ((event.clientY - drag.pointerY) / banner.clientHeight) * 100;
		// Dragging down should reveal the upper part of the image, so the focal
		// point moves opposite to the pointer.
		setDraftY(Math.min(100, Math.max(0, drag.startY - deltaPercent)));
	}

	function handlePointerUp() {
		dragStateRef.current = null;
	}

	const banner = (
		<div
			ref={bannerRef}
			aria-hidden={!repositioning}
			className={cn(
				"relative h-32 w-full shrink-0 border-b border-border md:h-40",
				repositioning && "cursor-ns-resize touch-none select-none",
			)}
			style={style}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
		>
			{repositioning && (
				<div className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-2">
					<span className="rounded-md bg-background/85 px-2 py-1 text-[11px] font-medium text-foreground shadow-sm backdrop-blur">
						Drag to reposition
					</span>
					<button
						type="button"
						onClick={commitReposition}
						className="rounded-md bg-foreground px-2.5 py-1 text-[11px] font-medium text-background shadow-sm transition-colors hover:bg-foreground/90"
					>
						Save
					</button>
					<button
						type="button"
						onClick={cancelReposition}
						className="rounded-md bg-background/85 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground"
					>
						Cancel
					</button>
				</div>
			)}
		</div>
	);

	if (!onCoverChange) {
		return banner;
	}

	return (
		<>
			<ContextMenu>
				<ContextMenuTrigger asChild disabled={repositioning}>
					{banner}
				</ContextMenuTrigger>
				<ContextMenuContent className="w-52">
					{imageCover && (
						<>
							<ContextMenuItem
								disabled={!resolvedSrc}
								onSelect={() => setLightboxOpen(true)}
							>
								<Expand className="mr-2 h-3.5 w-3.5" />
								View full size
							</ContextMenuItem>
							<ContextMenuItem onSelect={beginReposition}>
								<MoveVertical className="mr-2 h-3.5 w-3.5" />
								Reposition
							</ContextMenuItem>
							<ContextMenuSeparator />
						</>
					)}
					<ContextMenuSub>
						<ContextMenuSubTrigger>
							<ImageIcon className="mr-2 h-3.5 w-3.5" />
							Change cover
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
					<ContextMenuSeparator />
					<ContextMenuItem
						className="text-destructive focus:bg-destructive/10 focus:text-destructive"
						onSelect={() => onCoverChange("")}
					>
						<Trash2 className="mr-2 h-3.5 w-3.5" />
						Remove cover
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>

			<input
				ref={upload.fileInputRef}
				type="file"
				accept="image/png,image/jpeg,image/webp,image/gif"
				className="hidden"
				onChange={upload.handleFileSelected}
			/>

			<Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
				<DialogContent className="max-w-[min(92vw,1200px)] border-border bg-background/95 p-2 backdrop-blur">
					<DialogTitle className="sr-only">Cover image</DialogTitle>
					{resolvedSrc && (
						// eslint-disable-next-line @next/next/no-img-element -- lightbox shows the raw uploaded asset (possibly a blob: URL) at natural size
						<img
							src={resolvedSrc}
							alt="Note cover"
							className="max-h-[82vh] w-full rounded-sm object-contain"
						/>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}

type PickerProps = {
	cover?: string;
	onCoverChange: (cover: string) => void;
};

export const NoteCoverPicker = memo(function NoteCoverPicker({
	cover,
	onCoverChange,
}: PickerProps) {
	const [open, setOpen] = useState(false);
	const [url, setUrl] = useState("");
	const upload = useCoverUpload(onCoverChange, () => setOpen(false));
	const triggerStyle = useCoverStyle(cover ?? "");

	function applyUrl() {
		const trimmed = url.trim();
		if (!trimmed) return;
		onCoverChange(trimmed);
		setUrl("");
		setOpen(false);
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
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
			</PopoverTrigger>
			<PopoverContent className="w-[260px] p-2.5" align="start" side="right">
				<p className="mb-1.5 px-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">
					Gradient
				</p>
				<div className="grid grid-cols-3 gap-1.5">
					{Object.entries(NOTE_COVER_GRADIENTS).map(([id, gradient]) => {
						const value = `${GRADIENT_PREFIX}${id}`;
						const selected = cover === value;
						return (
							<button
								key={id}
								type="button"
								aria-label={`Use ${id} cover gradient`}
								onClick={() => {
									onCoverChange(value);
									setOpen(false);
								}}
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

				{upload.canUpload && (
					<>
						<p className="mb-1.5 mt-3 px-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">
							Upload
						</p>
						<input
							ref={upload.fileInputRef}
							type="file"
							accept="image/png,image/jpeg,image/webp,image/gif"
							className="hidden"
							onChange={upload.handleFileSelected}
						/>
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
				)}

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
			</PopoverContent>
		</Popover>
	);
});
