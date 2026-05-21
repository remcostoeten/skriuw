"use client";

import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, History, RotateCcw } from "lucide-react";
import { useMemo } from "react";
import { summarizeNoteVersionReason } from "@/domain/notes/versioning";
import { isMdxNote } from "@/features/editor/lib/editor-mode";
import { usePreferencesStore } from "@/features/settings/store";
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
	const ageLabel = formatDistanceToNow(version.createdAt, { addSuffix: false });
	const reasonLabel = summarizeNoteVersionReason(version.reason);

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
					<div className="flex shrink-0 items-center gap-1.5">
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

			<div className="flex min-h-0 flex-1 overflow-hidden">
				<Editor
					file={previewFile}
					files={files}
					editorMode={effectiveMode}
					editorFontId={editorPrefs.defaultFont}
					editorLineHeight={editorPrefs.lineHeight}
					isMobile={isMobile}
					readOnly
					onContentChange={() => {}}
				/>
			</div>
		</div>
	);
}
