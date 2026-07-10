"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Images, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
import type { CoverImage } from "@/core/workspace-backend";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import { showUserToast } from "@/shared/lib/user-toast";
import { Button } from "@/shared/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/ui/dialog";
import { settingsFocusDomId } from "@/features/settings/lib/settings-focus-anchor";

type LoadState = "idle" | "loading" | "error";

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB", "TB"];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function CoverGalleryManager({ isSignedIn }: { isSignedIn: boolean }) {
	const backend = useWorkspaceBackend();
	const [images, setImages] = useState<CoverImage[]>([]);
	const [state, setState] = useState<LoadState>("idle");
	const [selectedImage, setSelectedImage] = useState<CoverImage | null>(null);
	const [pendingDelete, setPendingDelete] = useState<CoverImage | null>(null);
	const [deleting, setDeleting] = useState(false);

	async function loadImages() {
		if (!isSignedIn || !backend.listCoverImagesDetailed) return;
		setState("loading");
		try {
			setImages(await backend.listCoverImagesDetailed());
			setState("idle");
		} catch {
			setState("error");
		}
	}

	useEffect(() => {
		void loadImages();
	}, [isSignedIn, backend]);

	async function confirmDelete() {
		if (!pendingDelete || !backend.deleteCoverImage) return;
		const target = pendingDelete;
		setDeleting(true);
		try {
			await backend.deleteCoverImage(target);
			setImages((current) => current.filter((image) => image.pathname !== target.pathname));
			if (selectedImage?.pathname === target.pathname) setSelectedImage(null);
			setPendingDelete(null);
			showUserToast("Cover image deleted.", "success");
		} catch {
			showUserToast("Could not delete this image.", "error");
		} finally {
			setDeleting(false);
		}
	}

	if (!isSignedIn || !backend.listCoverImagesDetailed) return null;

	const totalBytes = images.reduce((sum, image) => sum + image.size, 0);

	return (
		<>
			<div
				id={settingsFocusDomId("cover-gallery")}
				data-settings-focus="cover-gallery"
				className="rounded-lg border border-border/60 bg-card/40 px-5 py-4"
			>
				<div className="flex items-start justify-between gap-4">
					<div className="space-y-1">
						<div className="flex items-center gap-2">
							<h3 className="text-sm font-medium text-foreground">Cover gallery</h3>
							<span className="text-xs text-muted-foreground">
								{images.length} images · {formatBytes(totalBytes)}
							</span>
						</div>
						<p className="text-xs text-muted-foreground">
							All cover images stored for your account. Open an image to view it at
							full size, or delete ones you no longer need.
						</p>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={loadImages}
						disabled={state === "loading"}
					>
						{state === "loading" ? (
							<LoaderCircle className="size-3.5 animate-spin" />
						) : (
							<RefreshCw className="size-3.5" />
						)}
						Refresh
					</Button>
				</div>

				<div className="my-4 border-t border-border/50" />

				{state === "loading" && images.length === 0 ? (
					<div className="flex h-28 items-center justify-center text-sm text-muted-foreground">
						<LoaderCircle className="mr-2 size-4 animate-spin" />
						Loading cover images
					</div>
				) : state === "error" ? (
					<p className="text-sm text-destructive">
						Could not load cover images. Check the configured storage connection and
						retry.
					</p>
				) : images.length === 0 ? (
					<div className="flex h-28 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
						<Images className="size-5" />
						No uploaded cover images yet.
					</div>
				) : (
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
						{images.map((image) => (
							<div
								key={image.pathname}
								className="group relative aspect-[3/2] overflow-hidden rounded-md border border-border bg-muted/30"
							>
								<button
									type="button"
									onClick={() => setSelectedImage(image)}
									className="block h-full w-full text-left transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
									aria-label="View cover image"
								>
									<Image
										src={image.url}
										alt=""
										fill
										sizes="(max-width: 768px) 50vw, 25vw"
										unoptimized
										className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
									/>
								</button>
								<div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-6 opacity-0 transition-opacity group-hover:opacity-100">
									<span className="text-[11px] font-medium text-white/90">
										{formatBytes(image.size)}
									</span>
									<button
										type="button"
										onClick={() => setPendingDelete(image)}
										className="pointer-events-auto rounded-md bg-black/40 p-1.5 text-white/90 transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
										aria-label="Delete cover image"
									>
										<Trash2 className="size-3.5" />
									</button>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			<Dialog
				open={selectedImage !== null}
				onOpenChange={(open) => !open && setSelectedImage(null)}
			>
				<DialogContent className="max-w-[min(92vw,1200px)] border-border bg-background/95 p-2 backdrop-blur">
					<DialogTitle className="sr-only">Cover image</DialogTitle>
					{selectedImage && (
						<div className="relative h-[82vh]">
							<Image
								src={selectedImage.url}
								alt="Cover"
								fill
								sizes="(max-width: 1200px) 92vw, 1200px"
								unoptimized
								className="rounded-sm object-contain"
							/>
						</div>
					)}
				</DialogContent>
			</Dialog>

			<Dialog
				open={pendingDelete !== null}
				onOpenChange={(open) => !open && !deleting && setPendingDelete(null)}
			>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Delete cover image?</DialogTitle>
						<DialogDescription>
							This permanently removes the image from your storage. Notes already
							using it will keep the reference but the image will no longer load.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setPendingDelete(null)}
							disabled={deleting}
						>
							Cancel
						</Button>
						<Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
							{deleting ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
							Delete
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
