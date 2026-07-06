"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Copy, Download, ImageIcon, Loader2 } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { showUserToast } from "@/shared/lib/user-toast";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
import { buildNoteSharePayload } from "@/features/notes/lib/note-share-export";
import {
	buildNoteImageFileName,
	buildNoteImagePreview,
	copyImageBlobToClipboard,
	downloadImageBlob,
	renderElementToPngBlob,
} from "@/features/notes/lib/note-image-export";
import type { NoteFile } from "@/types/notes";

type NoteImageSource = Pick<NoteFile, "id" | "name" | "content">;

type CardTheme = {
	id: string;
	label: string;
	background: string;
	swatch: string;
};

const CARD_THEMES: CardTheme[] = [
	{
		id: "midnight",
		label: "Midnight",
		background: "linear-gradient(150deg, #1b1d2b 0%, #101018 55%, #05060b 100%)",
		swatch: "linear-gradient(150deg, #1b1d2b 0%, #05060b 100%)",
	},
	{
		id: "dawn",
		label: "Dawn",
		background: "linear-gradient(150deg, #fef4ec 0%, #f7e0e9 55%, #efd6f2 100%)",
		swatch: "linear-gradient(150deg, #fef4ec 0%, #efd6f2 100%)",
	},
	{
		id: "forest",
		label: "Forest",
		background: "linear-gradient(150deg, #0f2a24 0%, #123a2c 55%, #071b16 100%)",
		swatch: "linear-gradient(150deg, #0f2a24 0%, #071b16 100%)",
	},
];

function isLightTheme(theme: CardTheme): boolean {
	return theme.id === "dawn";
}

function ShareImageCard({
	title,
	preview,
	theme,
	cardRef,
}: {
	title: string;
	preview: string;
	theme: CardTheme;
	cardRef: React.RefObject<HTMLDivElement | null>;
}) {
	const light = isLightTheme(theme);
	const titleColor = light ? "#1c1a22" : "#f7f7fb";
	const bodyColor = light ? "rgba(28,26,34,0.72)" : "rgba(247,247,251,0.74)";
	const metaColor = light ? "rgba(28,26,34,0.5)" : "rgba(247,247,251,0.5)";
	const borderColor = light ? "rgba(28,26,34,0.08)" : "rgba(247,247,251,0.1)";

	return (
		<div
			ref={cardRef}
			style={{ width: 640, background: theme.background }}
			className="flex flex-col justify-between rounded-[28px] p-14"
		>
			<div>
				<div
					className="text-[13px] font-medium uppercase tracking-[0.22em]"
					style={{ color: metaColor }}
				>
					skriuw
				</div>
				<h2
					className="mt-7 text-[34px] font-semibold leading-[1.15]"
					style={{ color: titleColor }}
				>
					{title}
				</h2>
				<p
					className="mt-6 whitespace-pre-wrap text-[17px] leading-[1.6]"
					style={{ color: bodyColor }}
				>
					{preview || "This note has no additional content yet."}
				</p>
			</div>
			<div
				className="mt-12 flex items-center justify-between border-t pt-6 text-[13px]"
				style={{ borderColor, color: metaColor }}
			>
				<span>Written in skriuw</span>
				<span>skriuw.app</span>
			</div>
		</div>
	);
}

export function NoteShareImageDialog({
	note,
	open,
	onOpenChange,
}: {
	note: NoteImageSource;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const cardRef = useRef<HTMLDivElement | null>(null);
	const [themeId, setThemeId] = useState(CARD_THEMES[0].id);
	const [isBusy, setIsBusy] = useState(false);
	const [justCopied, setJustCopied] = useState(false);

	const payload = useMemo(() => buildNoteSharePayload(note), [note]);
	const preview = useMemo(() => buildNoteImagePreview(payload.markdown), [payload.markdown]);
	const theme = CARD_THEMES.find((entry) => entry.id === themeId) ?? CARD_THEMES[0];

	async function withRenderedBlob(action: (blob: Blob) => Promise<void> | void) {
		if (!cardRef.current) return;
		setIsBusy(true);
		try {
			const blob = await renderElementToPngBlob(cardRef.current);
			if (!blob) {
				showUserToast("Couldn't render image", "error");
				triggerNativeFeedback("dismiss");
				return;
			}
			await action(blob);
		} catch {
			showUserToast("Couldn't render image", "error");
			triggerNativeFeedback("dismiss");
		} finally {
			setIsBusy(false);
		}
	}

	function handleDownload() {
		void withRenderedBlob((blob) => {
			downloadImageBlob(blob, buildNoteImageFileName(payload.title));
			showUserToast("Image saved", "success");
			triggerNativeFeedback("success");
		});
	}

	function handleCopy() {
		void withRenderedBlob(async (blob) => {
			const copied = await copyImageBlobToClipboard(blob);
			if (!copied) {
				showUserToast("Couldn't copy image", "error");
				triggerNativeFeedback("dismiss");
				return;
			}
			setJustCopied(true);
			showUserToast("Image copied", "success");
			triggerNativeFeedback("success");
			window.setTimeout(() => setJustCopied(false), 1600);
		});
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<ImageIcon className="h-4 w-4" />
						Share as image
					</DialogTitle>
					<DialogDescription>
						Export this note as a styled card you can share anywhere.
					</DialogDescription>
				</DialogHeader>

				<div className="flex justify-center overflow-hidden rounded-xl bg-muted/40 p-4">
					<div
						className="origin-top"
						style={{ transform: "scale(0.62)", marginBottom: -180 }}
					>
						<ShareImageCard
							title={payload.title}
							preview={preview}
							theme={theme}
							cardRef={cardRef}
						/>
					</div>
				</div>

				<div className="flex items-center gap-2">
					<span className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
						Style
					</span>
					<div className="flex gap-2">
						{CARD_THEMES.map((entry) => (
							<button
								key={entry.id}
								type="button"
								aria-label={entry.label}
								onClick={() => setThemeId(entry.id)}
								style={{ background: entry.swatch }}
								className={cn(
									"h-7 w-7 rounded-full border transition-transform hover:scale-105",
									entry.id === themeId
										? "border-foreground ring-2 ring-ring/60"
										: "border-border",
								)}
							/>
						))}
					</div>
				</div>

				<div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
					<Button variant="outline" onClick={handleCopy} disabled={isBusy}>
						{isBusy ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : justCopied ? (
							<Check className="h-4 w-4" />
						) : (
							<Copy className="h-4 w-4" />
						)}
						Copy image
					</Button>
					<Button onClick={handleDownload} disabled={isBusy}>
						{isBusy ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<Download className="h-4 w-4" />
						)}
						Download PNG
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
