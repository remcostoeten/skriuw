"use client";

import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, Columns2, Eye, History, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { summarizeNoteVersionReason } from "@/domain/notes/versioning";
import { isMdxNote } from "@/features/editor/lib/editor-mode";
import { usePreferencesStore } from "@/features/settings/store";
import { cn } from "@/shared/lib/utils";
import type { NoteFile, NoteVersion } from "@/types/notes";
import { Editor } from "./editor";

type Props = {
	version: NoteVersion;
	file: NoteFile | null;
	files: NoteFile[];
	isMobile: boolean;
	isRestoring: boolean;
	onBack: () => void;
	onRestore: () => void;
};

type PreviewMode = "preview" | "compare";

export function VersionPreviewContainer({
	version,
	file,
	files,
	isMobile,
	isRestoring,
	onBack,
	onRestore,
}: Props) {
	const editorPrefs = usePreferencesStore((s) => s.editor);
	const [previewMode, setPreviewMode] = useState<PreviewMode>("preview");

	const previewFile = useMemo<NoteFile | null>(() => {
		if (!file) return null;
		return {
			...file,
			name: version.name,
			content: version.content,
			richContent: version.richContent,
			preferredEditorMode: version.preferredEditorMode,
			tags: version.tags ?? file.tags,
			parentId: version.parentId,
			modifiedAt: version.createdAt,
		};
	}, [file, version]);

	const effectiveMode = isMdxNote(previewFile)
		? "raw"
		: (version.preferredEditorMode ?? "block");
	const currentMode = isMdxNote(file)
		? "raw"
		: (file?.preferredEditorMode ?? "block");
	const ageLabel = formatDistanceToNow(version.createdAt, { addSuffix: false });
	const reasonLabel = summarizeNoteVersionReason(version.reason);
	const isCompareMode = previewMode === "compare";

	function renderEditor(targetFile: NoteFile | null, mode: "raw" | "block") {
		return (
			<Editor
				file={targetFile}
				files={files}
				editorMode={mode}
				editorFontId={editorPrefs.defaultFont}
				editorLineHeight={editorPrefs.lineHeight}
				isMobile={isMobile}
				readOnly
				onContentChange={() => {}}
			/>
		);
	}

	return (
		<div className="flex flex-1 flex-col overflow-hidden">
			<div className="border-b border-amber-500/35 bg-[linear-gradient(135deg,hsl(var(--warning)/0.14),hsl(var(--background)/0.94))] px-4 py-3 text-xs">
				<div className="flex flex-wrap items-center gap-3">
					<div className="flex min-w-0 flex-1 items-start gap-3">
						<History
							className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground"
							strokeWidth={1.5}
							aria-hidden
						/>
						<div className="min-w-0 space-y-0.5">
							<div className="flex flex-wrap items-center gap-2">
								<span className="font-medium text-warning-foreground">
									Viewing checkpoint from {ageLabel} ago
								</span>
								<span className="border border-warning/30 bg-warning/10 px-1.5 py-px font-mono text-[10px] uppercase tracking-wide text-warning-foreground/80">
									{reasonLabel}
								</span>
							</div>
							<p className="text-warning-foreground/75">
								This view is read-only. Restore to make this version the current
								one. The live content is saved as a new checkpoint before
								restoring.
							</p>
						</div>
					</div>
					<div className="flex shrink-0 flex-wrap items-center gap-1.5">
						<div
							className="inline-flex border border-border bg-background p-0.5"
							aria-label="Version view mode"
						>
							<button
								type="button"
								onClick={() => setPreviewMode("preview")}
								aria-pressed={!isCompareMode}
								className={cn(
									"inline-flex items-center gap-1.5 px-2 py-1 text-[11px] transition-colors",
									!isCompareMode
										? "bg-foreground text-background"
										: "text-muted-foreground hover:bg-muted hover:text-foreground",
								)}
							>
								<Eye className="h-3 w-3" strokeWidth={1.7} />
								Preview
							</button>
							<button
								type="button"
								onClick={() => setPreviewMode("compare")}
								aria-pressed={isCompareMode}
								className={cn(
									"inline-flex items-center gap-1.5 px-2 py-1 text-[11px] transition-colors",
									isCompareMode
										? "bg-foreground text-background"
										: "text-muted-foreground hover:bg-muted hover:text-foreground",
								)}
							>
								<Columns2 className="h-3 w-3" strokeWidth={1.7} />
								Compare
							</button>
						</div>
						<button
							type="button"
							onClick={onBack}
							disabled={isRestoring}
							className="inline-flex items-center gap-1.5 border border-border bg-background px-2.5 py-1 text-[11px] text-foreground transition-colors hover:bg-muted disabled:opacity-60"
						>
							<ArrowLeft className="h-3 w-3" strokeWidth={1.7} />
							Back to current
						</button>
						<button
							type="button"
							onClick={onRestore}
							disabled={isRestoring}
							className="inline-flex items-center gap-1.5 bg-foreground px-2.5 py-1 text-[11px] font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-60"
						>
							<RotateCcw className="h-3 w-3" strokeWidth={1.7} />
							{isRestoring ? "Restoring..." : "Restore this version"}
						</button>
					</div>
				</div>
			</div>

			{isCompareMode ? (
				<div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
					<section
						aria-label="Checkpoint version"
						className="flex min-h-0 flex-col overflow-hidden border-b border-border md:border-b-0 md:border-r"
					>
						<div className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-muted/35 px-3">
							<span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
								Checkpoint
							</span>
							<span className="truncate text-[11px] text-muted-foreground">
								{ageLabel} ago
							</span>
						</div>
						<div className="min-h-0 flex-1 overflow-hidden">
							{renderEditor(previewFile, effectiveMode)}
						</div>
					</section>
					<section
						aria-label="Current version"
						className="flex min-h-0 flex-col overflow-hidden"
					>
						<div className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-muted/35 px-3">
							<span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
								Current
							</span>
							<span className="truncate text-[11px] text-muted-foreground">
								Live note
							</span>
						</div>
						<div className="min-h-0 flex-1 overflow-hidden">
							{renderEditor(file, currentMode)}
						</div>
					</section>
				</div>
			) : (
				<div className="flex min-h-0 flex-1 overflow-hidden">
					{renderEditor(previewFile, effectiveMode)}
				</div>
			)}
		</div>
	);
}
