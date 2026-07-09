"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Check, Image as ImageIcon, Loader2, Upload } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
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

function resolveCoverStyle(cover: string): React.CSSProperties {
	if (cover.startsWith(GRADIENT_PREFIX)) {
		const gradient = NOTE_COVER_GRADIENTS[cover.slice(GRADIENT_PREFIX.length)];
		return { backgroundImage: gradient ?? NOTE_COVER_GRADIENTS.slate };
	}
	return {
		backgroundImage: `url(${JSON.stringify(cover)})`,
		backgroundSize: "cover",
		backgroundPosition: "center",
	};
}

/** Resolves any cover value to a style, awaiting the blob URL for `vault-asset:` covers. */
function useCoverStyle(cover: string): React.CSSProperties {
	const [resolved, setResolved] = useState<string | null>(null);

	useEffect(() => {
		if (!cover.startsWith(VAULT_ASSET_PREFIX)) {
			setResolved(null);
			return;
		}
		let cancelled = false;
		const result = resolveVaultAssetUrl(cover);
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
	}, [cover]);

	if (cover.startsWith(VAULT_ASSET_PREFIX)) {
		return resolved ? resolveCoverStyle(resolved) : { backgroundColor: "hsl(var(--muted))" };
	}
	return resolveCoverStyle(cover);
}

export function NoteCoverBanner({ cover }: { cover: string }) {
	const style = useCoverStyle(cover);
	return (
		<div
			aria-hidden
			className="h-32 w-full shrink-0 border-b border-border md:h-40"
			style={style}
		/>
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
	const [uploadStatus, setUploadStatus] = useState<"idle" | "pending" | "success">("idle");
	const fileInputRef = useRef<HTMLInputElement>(null);
	const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
		};
	}, []);
	const backend = useWorkspaceBackend();
	const capabilities = useWorkspaceCapabilities();
	const triggerStyle = useCoverStyle(cover ?? "");

	function applyUrl() {
		const trimmed = url.trim();
		if (!trimmed) return;
		onCoverChange(trimmed);
		setUrl("");
		setOpen(false);
	}

	async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file || !backend.uploadCoverImage) return;

		setUploadStatus("pending");
		try {
			const compressed = await compressCoverImage(file);
			const value = await backend.uploadCoverImage(compressed);
			onCoverChange(value);
			setUploadStatus("success");
			closeTimerRef.current = setTimeout(() => {
				setOpen(false);
				setUploadStatus("idle");
			}, 900);
		} catch (error) {
			setUploadStatus("idle");
			showUserToast(
				error instanceof Error ? error.message : "Couldn't upload cover image.",
				"error",
			);
		}
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

				{capabilities.coverUpload && backend.uploadCoverImage && (
					<>
						<p className="mb-1.5 mt-3 px-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">
							Upload
						</p>
						<input
							ref={fileInputRef}
							type="file"
							accept="image/png,image/jpeg,image/webp,image/gif"
							className="hidden"
							onChange={handleFileSelected}
						/>
						<button
							type="button"
							onClick={() => fileInputRef.current?.click()}
							disabled={uploadStatus !== "idle"}
							className={cn(
								"flex h-7 w-full items-center justify-center overflow-hidden rounded-md border text-xs font-medium transition-all duration-[350ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
								uploadStatus === "success"
									? "border-emerald-500/50 bg-emerald-500/15 text-emerald-500"
									: "border-border text-foreground hover:bg-muted",
								uploadStatus === "pending" && "cursor-default opacity-80",
							)}
						>
							<MorphingLabel
								activeKey={uploadStatus}
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
