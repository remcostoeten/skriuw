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

type DiffCell = {
	lineNumber: number | null;
	text: string;
	type: "equal" | "added" | "removed" | "empty";
};

type DiffRow = {
	id: string;
	left: DiffCell;
	right: DiffCell;
};

const EMPTY_DIFF_CELL: DiffCell = {
	lineNumber: null,
	text: "",
	type: "empty",
};

function splitLines(content: string) {
	return content.length > 0 ? content.split("\n") : [""];
}

function buildLineDiffRows(previousContent: string, currentContent: string): DiffRow[] {
	const previousLines = splitLines(previousContent);
	const currentLines = splitLines(currentContent);
	const matrix = Array.from({ length: previousLines.length + 1 }, () =>
		Array.from({ length: currentLines.length + 1 }, () => 0),
	);

	for (let previousIndex = previousLines.length - 1; previousIndex >= 0; previousIndex -= 1) {
		for (let currentIndex = currentLines.length - 1; currentIndex >= 0; currentIndex -= 1) {
			matrix[previousIndex][currentIndex] =
				previousLines[previousIndex] === currentLines[currentIndex]
					? matrix[previousIndex + 1][currentIndex + 1] + 1
					: Math.max(
							matrix[previousIndex + 1][currentIndex],
							matrix[previousIndex][currentIndex + 1],
						);
		}
	}

	const rows: DiffRow[] = [];
	let previousIndex = 0;
	let currentIndex = 0;

	while (previousIndex < previousLines.length || currentIndex < currentLines.length) {
		const previousLine = previousLines[previousIndex];
		const currentLine = currentLines[currentIndex];

		if (
			previousIndex < previousLines.length &&
			currentIndex < currentLines.length &&
			previousLine === currentLine
		) {
			rows.push({
				id: `equal-${previousIndex}-${currentIndex}`,
				left: {
					lineNumber: previousIndex + 1,
					text: previousLine,
					type: "equal",
				},
				right: {
					lineNumber: currentIndex + 1,
					text: currentLine,
					type: "equal",
				},
			});
			previousIndex += 1;
			currentIndex += 1;
			continue;
		}

		const shouldAdd =
			currentIndex < currentLines.length &&
			(previousIndex >= previousLines.length ||
				matrix[previousIndex][currentIndex + 1] >= matrix[previousIndex + 1][currentIndex]);

		if (shouldAdd) {
			rows.push({
				id: `added-${previousIndex}-${currentIndex}`,
				left: EMPTY_DIFF_CELL,
				right: {
					lineNumber: currentIndex + 1,
					text: currentLine,
					type: "added",
				},
			});
			currentIndex += 1;
			continue;
		}

		rows.push({
			id: `removed-${previousIndex}-${currentIndex}`,
			left: {
				lineNumber: previousIndex + 1,
				text: previousLine,
				type: "removed",
			},
			right: EMPTY_DIFF_CELL,
		});
		previousIndex += 1;
	}

	return rows;
}

function DiffCellView({ cell }: { cell: DiffCell }) {
	const marker =
		cell.type === "added"
			? "+"
			: cell.type === "removed"
				? "-"
				: cell.type === "empty"
					? ""
					: " ";

	return (
		<div
			className={cn(
				"grid min-h-7 grid-cols-[3.5rem_1.75rem_minmax(0,1fr)] items-stretch border-b border-border/60 font-mono text-[12px] leading-5",
				cell.type === "added" && "bg-emerald-500/10 text-emerald-200",
				cell.type === "removed" && "bg-destructive/10 text-destructive-foreground",
				cell.type === "empty" && "bg-muted/15 text-muted-foreground/30",
			)}
		>
			<div className="select-none border-r border-border/55 px-2 py-1 text-right text-muted-foreground/45 tabular-nums">
				{cell.lineNumber ?? ""}
			</div>
			<div
				className={cn(
					"select-none border-r border-border/45 px-2 py-1 text-center font-semibold",
					cell.type === "added" && "text-emerald-300",
					cell.type === "removed" && "text-destructive",
				)}
				aria-hidden
			>
				{marker}
			</div>
			<pre className="min-w-0 whitespace-pre-wrap break-words px-3 py-1 font-mono">
				{cell.text || " "}
			</pre>
		</div>
	);
}

function UnifiedDiffRowView({ row }: { row: DiffRow }) {
	const cell = row.left.type === "empty" ? row.right : row.left;
	const marker = cell.type === "added" ? "+" : cell.type === "removed" ? "-" : " ";

	return (
		<div
			className={cn(
				"grid min-h-8 grid-cols-[2.5rem_2.5rem_1.5rem_minmax(0,1fr)] items-stretch border-b border-border/60 font-mono text-[11px] leading-5",
				cell.type === "added" && "bg-emerald-500/10 text-emerald-100",
				cell.type === "removed" && "bg-destructive/10 text-destructive-foreground",
			)}
		>
			<div className="select-none border-r border-border/50 px-1.5 py-1.5 text-right text-muted-foreground/45 tabular-nums">
				{row.left.lineNumber ?? ""}
			</div>
			<div className="select-none border-r border-border/50 px-1.5 py-1.5 text-right text-muted-foreground/45 tabular-nums">
				{row.right.lineNumber ?? ""}
			</div>
			<div
				className={cn(
					"select-none border-r border-border/40 px-1.5 py-1.5 text-center font-semibold",
					cell.type === "added" && "text-emerald-300",
					cell.type === "removed" && "text-destructive",
				)}
				aria-hidden
			>
				{marker}
			</div>
			<pre className="min-w-0 whitespace-pre-wrap break-words px-2.5 py-1.5 font-mono">
				{cell.text || " "}
			</pre>
		</div>
	);
}

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

	const effectiveMode = isMdxNote(previewFile) ? "raw" : (version.preferredEditorMode ?? "block");
	const ageLabel = formatDistanceToNow(version.createdAt, { addSuffix: false });
	const reasonLabel = summarizeNoteVersionReason(version.reason);
	const isCompareMode = previewMode === "compare";
	const diffRows = useMemo(
		() => buildLineDiffRows(version.content, file?.content ?? ""),
		[file?.content, version.content],
	);
	const diffStats = useMemo(
		() =>
			diffRows.reduce(
				(stats, row) => ({
					added: stats.added + (row.right.type === "added" ? 1 : 0),
					removed: stats.removed + (row.left.type === "removed" ? 1 : 0),
				}),
				{ added: 0, removed: 0 },
			),
		[diffRows],
	);
	const modeButtonClass =
		"inline-flex h-8 items-center justify-center gap-1.5 px-3 text-[11px] font-medium transition-colors";
	const actionButtonClass =
		"inline-flex h-8 items-center justify-center gap-1.5 border px-3 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55";

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
			<div className="border-b border-warning/30 bg-[linear-gradient(135deg,hsl(var(--warning)/0.12),hsl(var(--background)/0.96)_62%)] px-4 py-3 text-xs">
				<div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
					<div className="flex min-w-0 items-start gap-3">
						<History
							className="mt-1 h-4 w-4 shrink-0 text-warning-foreground/88"
							strokeWidth={1.5}
							aria-hidden
						/>
						<div className="min-w-0">
							<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
								<span className="text-sm font-semibold tracking-[-0.01em] text-warning-foreground">
									Viewing checkpoint from {ageLabel} ago
								</span>
								<span className="border border-warning/30 bg-warning/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-warning-foreground/78">
									{reasonLabel}
								</span>
							</div>
							<p className="mt-1 max-w-3xl leading-5 text-warning-foreground/70">
								Read-only preview. Restoring makes this version current and saves
								the live note as a new checkpoint first.
							</p>
						</div>
					</div>

					<div
						className={cn(
							"flex shrink-0 flex-wrap items-center gap-2",
							isMobile && "w-full",
						)}
					>
						<div
							className={cn(
								"inline-flex h-9 items-center border border-border bg-background/80 p-0.5 shadow-sm",
								isMobile && "w-full",
							)}
							aria-label="Version view mode"
						>
							<button
								type="button"
								onClick={() => setPreviewMode("preview")}
								aria-pressed={!isCompareMode}
								className={cn(
									modeButtonClass,
									isMobile && "flex-1",
									!isCompareMode
										? "bg-foreground text-background shadow-sm"
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
									modeButtonClass,
									isMobile && "flex-1",
									isCompareMode
										? "bg-foreground text-background shadow-sm"
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
							className={cn(
								actionButtonClass,
								isMobile && "flex-1",
								"border-border bg-background/80 text-foreground hover:bg-muted",
							)}
						>
							<ArrowLeft className="h-3 w-3" strokeWidth={1.7} />
							Back to current
						</button>
						<button
							type="button"
							onClick={onRestore}
							disabled={isRestoring}
							className={cn(
								actionButtonClass,
								isMobile && "flex-1",
								"border-foreground bg-foreground text-background shadow-sm hover:bg-foreground/90",
							)}
						>
							<RotateCcw className="h-3 w-3" strokeWidth={1.7} />
							{isRestoring ? "Restoring..." : "Restore this version"}
						</button>
					</div>
				</div>
			</div>

			{isCompareMode ? (
				<div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
					<div
						aria-label={isMobile ? "Unified line diff" : "Side-by-side line diff"}
						className="min-h-0 flex-1 overflow-auto"
					>
						{isMobile ? (
							<div>
								<div className="sticky top-0 z-10 border-b border-border bg-muted/95 backdrop-blur">
									<div className="flex h-9 items-center justify-between px-3">
										<div className="flex items-center gap-2">
											<span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
												Unified diff
											</span>
											<span className="border border-destructive/25 bg-destructive/10 px-1.5 py-px font-mono text-[10px] text-destructive">
												-{diffStats.removed}
											</span>
											<span className="border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-px font-mono text-[10px] text-emerald-300">
												+{diffStats.added}
											</span>
										</div>
										<span className="text-[10px] text-muted-foreground/60">
											old / new
										</span>
									</div>
									<div className="grid grid-cols-[2.5rem_2.5rem_1.5rem_minmax(0,1fr)] border-t border-border/70 px-0 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/50">
										<div className="border-r border-border/50 px-1.5 py-1 text-right">
											Old
										</div>
										<div className="border-r border-border/50 px-1.5 py-1 text-right">
											New
										</div>
										<div className="border-r border-border/40 px-1.5 py-1 text-center">
											Δ
										</div>
										<div className="px-2.5 py-1">Line</div>
									</div>
								</div>
								{diffRows.map((row) => (
									<UnifiedDiffRowView key={row.id} row={row} />
								))}
							</div>
						) : (
							<div className="min-w-[56rem]">
								<div className="sticky top-0 z-10 grid h-9 grid-cols-2 border-b border-border bg-muted/90 backdrop-blur">
									<div className="flex items-center justify-between border-r border-border px-3">
										<div className="flex items-center gap-2">
											<span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
												Checkpoint
											</span>
											<span className="border border-destructive/25 bg-destructive/10 px-1.5 py-px font-mono text-[10px] text-destructive">
												-{diffStats.removed}
											</span>
										</div>
										<span className="truncate text-[11px] text-muted-foreground">
											{ageLabel} ago
										</span>
									</div>
									<div className="flex items-center justify-between px-3">
										<div className="flex items-center gap-2">
											<span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
												Current
											</span>
											<span className="border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-px font-mono text-[10px] text-emerald-300">
												+{diffStats.added}
											</span>
										</div>
										<span className="truncate text-[11px] text-muted-foreground">
											Live note
										</span>
									</div>
								</div>
								{diffRows.map((row) => (
									<div key={row.id} className="grid grid-cols-2">
										<div className="border-r border-border">
											<DiffCellView cell={row.left} />
										</div>
										<DiffCellView cell={row.right} />
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			) : (
				<div className="flex min-h-0 flex-1 overflow-hidden">
					{renderEditor(previewFile, effectiveMode)}
				</div>
			)}
		</div>
	);
}
