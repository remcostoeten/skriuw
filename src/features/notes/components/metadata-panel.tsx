"use client";

import { formatDistanceToNow } from "date-fns";
import {
	ArrowUpRight,
	ChevronRight,
	Eye,
	FileText,
	GitBranch,
	Hash,
	History,
	Info,
	Link2,
	ListTree,
	Plus,
	X,
} from "lucide-react";
import { memo, type ComponentType, type ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { NoteVersionReason } from "@/domain/notes/models";
import { summarizeNoteVersionReason, formatNoteVersionDelta } from "@/domain/notes/versioning";
import { useCreateNote } from "@/features/notes/hooks/use-create-note";
import { useNoteBacklinks } from "@/features/notes/hooks/use-note-backlinks";
import { useNoteVersions } from "@/features/notes/hooks/use-note-versions";
import {
	buildOutgoingNoteLinks,
	extractNoteTags,
	getNoteTitle,
	type ResolvedNoteLink,
} from "@/domain/notes/note-links";
import { isMdxNote } from "@/features/editor/lib/editor-mode";
import { useNotesStore } from "@/features/notes/store";
import { cn } from "@/shared/lib/utils";
import { AnimatedNumber } from "@/shared/ui/animated-number";
import type { NoteFile, NoteVersion } from "@/types/notes";

type Props = {
	file: NoteFile | null;
	files?: NoteFile[];
	className?: string;
	isMobile?: boolean;
	editorMode?: "raw" | "block";
	onToggleEditorMode?: () => void;
	onRequestClose?: () => void;
	onFileSelect?: (id: string) => void;
	onViewVersion?: (version: NoteVersion) => void;
	onShare?: (noteId: string) => void;
};

type SectionKey = "outline" | "tags" | "links" | "history" | "details";

function normalizeTag(tag: string): string {
	return tag.trim().replace(/^#/, "").toLowerCase();
}

function uniqueTags(file: NoteFile): string[] {
	return [
		...new Set(
			[...(file.tags ?? []), ...extractNoteTags(file.content)]
				.map(normalizeTag)
				.filter(Boolean),
		),
	].toSorted((a, b) => a.localeCompare(b));
}

function formatSize(bytes: number) {
	if (bytes === 0) return "0 Bytes";
	if (bytes < 1024) return `${bytes} Bytes`;
	return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatTime(date: Date) {
	return `${formatDistanceToNow(date, { addSuffix: false })} ago`;
}

function InspectorSection({
	id,
	title,
	icon: Icon,
	count,
	open,
	onToggle,
	children,
	className,
}: {
	id: string;
	title: string;
	icon: ComponentType<{ className?: string; strokeWidth?: number }>;
	count?: number;
	open: boolean;
	onToggle: () => void;
	children: ReactNode;
	className?: string;
}) {
	return (
		<section
			aria-labelledby={id}
			className={cn("border-b border-border", className)}
		>
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={open}
				className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors hover:bg-muted/50"
			>
				<div className="flex min-w-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/68">
					<Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
					<span className="truncate">{title}</span>
					{count !== undefined && (
						<span className="font-normal text-muted-foreground/44 tabular-nums">
							({count})
						</span>
					)}
				</div>
				<ChevronRight
					className={cn(
						"h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform",
						open && "rotate-90",
					)}
					strokeWidth={1.5}
				/>
			</button>
			{open && <div className="px-4 pb-4">{children}</div>}
		</section>
	);
}

function EmptyLine({ children }: { children: ReactNode }) {
	return (
		<p className="text-[13px] leading-5 text-muted-foreground/62">{children}</p>
	);
}

function InspectorNoteControls({
	canToggleEditorMode,
	effectiveEditorMode,
	onToggleEditorMode,
	shareLabel,
	onShare,
}: {
	canToggleEditorMode: boolean;
	effectiveEditorMode: "raw" | "block";
	onToggleEditorMode?: () => void;
	shareLabel: string;
	onShare: () => void;
}) {
	return (
		<>
			<div className="flex items-baseline justify-between gap-4">
				<dt className="text-[13px] text-muted-foreground">Format</dt>
				<dd>
					{canToggleEditorMode ? (
						<div
							className="inline-flex items-center gap-1.5 text-[13px]"
							role="group"
							aria-label="Editor mode"
						>
							<button
								type="button"
								onClick={
									effectiveEditorMode === "raw" ? onToggleEditorMode : undefined
								}
								aria-pressed={effectiveEditorMode === "block"}
								className={cn(
									"transition-colors",
									effectiveEditorMode === "block"
										? "font-medium text-foreground/80"
										: "text-muted-foreground/70 hover:text-foreground",
								)}
							>
								Block
							</button>
							<span aria-hidden className="text-muted-foreground/30">
								·
							</span>
							<button
								type="button"
								onClick={
									effectiveEditorMode === "block" ? onToggleEditorMode : undefined
								}
								aria-pressed={effectiveEditorMode === "raw"}
								className={cn(
									"transition-colors",
									effectiveEditorMode === "raw"
										? "font-medium text-foreground/80"
										: "text-muted-foreground/70 hover:text-foreground",
								)}
							>
								Raw
							</button>
						</div>
					) : (
						<span className="text-[13px] font-medium text-foreground/80">Source</span>
					)}
				</dd>
			</div>
			<div className="flex items-baseline justify-between gap-4">
				<dt className="text-[13px] text-muted-foreground">Share</dt>
				<dd>
					<button
						type="button"
						onClick={onShare}
						className="text-[13px] font-medium text-foreground/80 transition-colors hover:text-foreground"
					>
						{shareLabel}
					</button>
				</dd>
			</div>
		</>
	);
}

type VersionListItem = {
	id: string;
	name: string;
	content: string;
	createdAt: Date;
	reason: string;
	reasonKind: NoteVersionReason | "current";
	current?: boolean;
};

type VersionRowData = VersionListItem & {
	previousContent?: string;
};

type HistoryBranchRole = "head" | "branch" | "fork" | "trunk";

const HISTORY_TRUNK_X = 12;
const HISTORY_BRANCH_X = 26;

function getHistoryBranchRoles(items: VersionListItem[]): HistoryBranchRole[] {
	const forkIndex = items.findIndex(
		(item, index) => index > 0 && item.reasonKind === "restore",
	);

	if (forkIndex === -1) {
		return items.map((_, index) => (index === 0 ? "head" : "trunk"));
	}

	return items.map((_, index) => {
		if (index === 0) return "head";
		if (index < forkIndex) return "branch";
		if (index === forkIndex) return "fork";
		return "trunk";
	});
}

function findRestoredSourceIndex(
	items: VersionListItem[],
	forkIndex: number,
): number | null {
	if (forkIndex === -1) return null;

	const currentContent = items[0]?.content;
	if (!currentContent) return null;

	for (let index = forkIndex + 1; index < items.length; index += 1) {
		if (items[index].content === currentContent) {
			return index;
		}
	}

	return null;
}

function historyLaneX(role: HistoryBranchRole, hasFork: boolean) {
	if (!hasFork) return HISTORY_TRUNK_X;
	if (role === "head" || role === "branch") return HISTORY_BRANCH_X;
	return HISTORY_TRUNK_X;
}

function HistoryGraphNode({
	branchRole,
	isFirst,
	isLast,
	isCurrent,
	hasFork,
	isRestoredTrunkLink,
}: {
	branchRole: HistoryBranchRole;
	isFirst: boolean;
	isLast: boolean;
	isCurrent?: boolean;
	hasFork: boolean;
	isRestoredTrunkLink?: boolean;
}) {
	const laneX = historyLaneX(branchRole, hasFork);
	const isFork = branchRole === "fork";
	const lineClass = isRestoredTrunkLink
		? "border-l border-dashed border-border bg-transparent w-0"
		: "bg-border";

	if (!hasFork) {
		return (
			<>
				{!isFirst ? (
					<span
						aria-hidden
						className={cn(
							"absolute top-0 h-1/2 -translate-x-1/2",
							isRestoredTrunkLink ? "w-0 border-l border-dashed border-border" : "w-px bg-border",
						)}
						style={{ left: laneX }}
					/>
				) : null}
				{!isLast ? (
					<span
						aria-hidden
						className={cn(
							"absolute bottom-0 h-1/2 -translate-x-1/2",
							isRestoredTrunkLink ? "w-0 border-l border-dashed border-border" : "w-px bg-border",
						)}
						style={{ left: laneX }}
					/>
				) : null}
				<span
					className={cn(
						"absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background",
						isCurrent && isFork
							? "bg-emerald-400"
							: "bg-muted-foreground/40 group-hover:bg-foreground/60",
					)}
					style={{ left: laneX }}
					aria-hidden
				/>
			</>
		);
	}

	return (
		<>
			{branchRole === "head" || branchRole === "branch" ? (
				<>
					{!isFirst ? (
						<span
							aria-hidden
							className={cn(
								"absolute top-0 h-1/2 w-px -translate-x-1/2",
								lineClass,
							)}
							style={{ left: HISTORY_BRANCH_X }}
						/>
					) : null}
					{!isLast ? (
						<span
							aria-hidden
							className={cn(
								"absolute bottom-0 h-1/2 w-px -translate-x-1/2",
								lineClass,
							)}
							style={{ left: HISTORY_BRANCH_X }}
						/>
					) : null}
				</>
			) : null}

			{branchRole === "fork" ? (
				<>
					<svg
						aria-hidden
						className="pointer-events-none absolute left-0 top-0 h-full w-8 overflow-visible text-border"
						viewBox="0 0 32 32"
						preserveAspectRatio="none"
					>
						<path
							d={`M ${HISTORY_TRUNK_X} 16 V 32`}
							fill="none"
							stroke="currentColor"
							strokeWidth="1"
						/>
						<path
							d={`M ${HISTORY_TRUNK_X} 16 H ${HISTORY_BRANCH_X} V 0`}
							fill="none"
							stroke="currentColor"
							strokeWidth="1"
							className="text-border"
						/>
						<path
							d={`M ${HISTORY_TRUNK_X} 16 H ${HISTORY_BRANCH_X}`}
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							className="text-amber-400/80"
						/>
					</svg>
					<span
						aria-hidden
						className="absolute top-0 h-1/2 w-px -translate-x-1/2 bg-border"
						style={{ left: HISTORY_BRANCH_X }}
					/>
				</>
			) : null}

			{branchRole === "trunk" ? (
				<>
					{!isFirst ? (
						<span
							aria-hidden
							className={cn(
								"absolute top-0 h-1/2 -translate-x-1/2",
								isRestoredTrunkLink
									? "w-0 border-l border-dashed border-border"
									: "w-px bg-border",
							)}
							style={{ left: HISTORY_TRUNK_X }}
						/>
					) : null}
					{!isLast ? (
						<span
							aria-hidden
							className={cn(
								"absolute bottom-0 h-1/2 -translate-x-1/2",
								isRestoredTrunkLink
									? "w-0 border-l border-dashed border-border"
									: "w-px bg-border",
							)}
							style={{ left: HISTORY_TRUNK_X }}
						/>
					) : null}
				</>
			) : null}

			<span
				className={cn(
					"absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background",
					isCurrent && "bg-emerald-400",
					isFork && "bg-amber-400 ring-amber-400/20",
					!isCurrent &&
						!isFork &&
						"bg-muted-foreground/40 group-hover:bg-foreground/60",
				)}
				style={{ left: laneX }}
				aria-hidden
			/>
		</>
	);
}

function VersionDelta({
	currentContent,
	previousContent,
	colorized = false,
}: {
	currentContent: string;
	previousContent?: string;
	colorized?: boolean;
}) {
	if (!previousContent) {
		return null;
	}

	const delta = formatNoteVersionDelta(currentContent, previousContent);
	const parts = delta.split(" ");

	return (
		<span className="inline-flex shrink-0 items-baseline gap-1 font-mono text-[10px] tabular-nums">
			{parts.map((part, index) => {
				const value = Number.parseInt(part, 10);
				return (
					<span
						key={`${part}-${index}`}
						className={cn(
							"inline-flex items-baseline gap-0.5",
							colorized && value > 0 && "text-emerald-400",
							colorized && value < 0 && "text-destructive",
							(!colorized || value === 0) && "text-muted-foreground/70",
						)}
					>
						<span>{value < 0 ? "−" : "+"}</span>
						<AnimatedNumber value={Math.abs(value)} />
					</span>
				);
			})}
		</span>
	);
}

function getVersionEventLabel(version: VersionListItem) {
	if (
		version.reasonKind === "autosave" ||
		version.reasonKind === "checkpoint" ||
		version.reasonKind === "restore"
	) {
		return null;
	}
	return version.reason;
}

const VersionRow = memo(function VersionRow({
	version,
	previousContent,
	branchRole,
	isFirst,
	isLast,
	hasFork,
	isRestoredSource,
	isRestoredTrunkLink,
	onView,
}: {
	version: VersionListItem;
	previousContent?: string;
	branchRole: HistoryBranchRole;
	isFirst: boolean;
	isLast: boolean;
	hasFork: boolean;
	isRestoredSource?: boolean;
	isRestoredTrunkLink?: boolean;
	onView?: () => void;
}) {
	const eventLabel = getVersionEventLabel(version);
	const isFork = branchRole === "fork";
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		setMounted(true);
	}, []);

	const delta =
		previousContent !== undefined ? (
			<VersionDelta
				currentContent={version.content}
				previousContent={previousContent}
				colorized={isFork}
			/>
		) : null;

	return (
		<li className="group relative py-1.5 pl-9 pr-11">
			<HistoryGraphNode
				branchRole={branchRole}
				isFirst={isFirst}
				isLast={isLast}
				isCurrent={version.current}
				hasFork={hasFork}
				isRestoredTrunkLink={isRestoredTrunkLink}
			/>
			<div className="flex min-w-0 items-center gap-1.5">
				<span className="shrink-0 text-[11px] text-muted-foreground">
					{mounted ? formatDistanceToNow(version.createdAt, { addSuffix: false }) : ""}{" "}
					ago
				</span>
				{isFork ? (
					<>
						<span aria-hidden className="text-[10px] text-muted-foreground/30">
							·
						</span>
						<span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium uppercase tracking-[0.12em] text-amber-400/90">
							<GitBranch className="h-3 w-3 shrink-0" strokeWidth={1.75} />
							Restored
						</span>
					</>
				) : isRestoredSource ? (
					<>
						<span aria-hidden className="text-[10px] text-muted-foreground/30">
							·
						</span>
						<span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/55">
							Source
						</span>
					</>
				) : null}
				{eventLabel ? (
					<>
						<span aria-hidden className="text-[10px] text-muted-foreground/30">
							·
						</span>
						<span className="truncate text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60">
							{eventLabel}
						</span>
					</>
				) : null}
				{delta ? (
					<>
						<span aria-hidden className="text-[10px] text-muted-foreground/30">
							·
						</span>
						{delta}
					</>
				) : null}
			</div>
			{!version.current && onView ? (
				<button
					type="button"
					onClick={onView}
					className="absolute right-0 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:text-foreground"
				>
					<Eye className="h-2.5 w-2.5" strokeWidth={1.6} />
					View
				</button>
			) : null}
		</li>
	);
});

function LinkRow({
	link,
	filesById,
	onFileSelect,
}: {
	link: ResolvedNoteLink;
	filesById: Map<string, NoteFile>;
	onFileSelect?: (id: string) => void;
}) {
	const createNote = useCreateNote();
	const source = filesById.get(link.sourceNoteId);
	const target = link.targetNoteId ? filesById.get(link.targetNoteId) : null;
	const title =
		source && source.id !== link.targetNoteId
			? getNoteTitle(source)
			: target
				? getNoteTitle(target)
				: link.alias || link.targetLabel;
	const isResolved = link.status === "resolved" && link.targetNoteId;
	const navigateTargetId =
		source && source.id !== link.targetNoteId ? source.id : link.targetNoteId;
	const rowLabel =
		source && source.id !== link.targetNoteId
			? `Open backlink source ${title}`
			: `Open linked note ${title}`;

	if (isResolved && navigateTargetId && onFileSelect) {
		return (
			<li>
				<button
					type="button"
					onClick={() => onFileSelect(navigateTargetId)}
					aria-label={rowLabel}
					className="group flex min-h-9 w-full cursor-pointer items-center gap-2 border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-muted focus-visible:border-ring focus-visible:bg-muted focus-visible:outline-none active:scale-[0.99]"
				>
					<FileText
						className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
						strokeWidth={1.5}
					/>
					<span className="min-w-0 flex-1 truncate text-[13px] text-foreground/82">
						{title}
					</span>
					<ArrowUpRight
						className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
						strokeWidth={1.5}
					/>
				</button>
			</li>
		);
	}

	if (link.status === "unresolved") {
		return (
			<li>
				<button
					type="button"
					onClick={() =>
						createNote.mutate({ name: title, content: `# ${title}\n\n` })
					}
					aria-label={`Create note "${title}"`}
					className="group flex min-h-9 w-full cursor-pointer items-center gap-2 border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-muted focus-visible:border-ring focus-visible:bg-muted focus-visible:outline-none active:scale-[0.99]"
				>
					<Plus
						className="h-3.5 w-3.5 shrink-0 text-muted-foreground/62"
						strokeWidth={1.5}
					/>
					<span className="min-w-0 flex-1 truncate text-[13px] text-foreground/82">
						{title}
					</span>
					<span className="text-[10px] uppercase tracking-[0.12em] text-primary/70">
						Create
					</span>
				</button>
			</li>
		);
	}

	return (
		<li className="flex min-h-9 items-center gap-2 px-2 py-1.5">
			<FileText
				className="h-3.5 w-3.5 shrink-0 text-muted-foreground/62"
				strokeWidth={1.5}
			/>
			<span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
				{link.alias || link.targetLabel}
			</span>
			<span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/52">
				{link.status}
			</span>
		</li>
	);
}

export function MetadataPanel({
	file,
	files = [],
	className,
	isMobile = false,
	editorMode = "block",
	onToggleEditorMode,
	onRequestClose,
	onFileSelect,
	onViewVersion,
	onShare,
}: Props) {
	const selectedTag = useNotesStore((state) => state.ui.selectedInspectorTag);
	const setSelectedTag = useNotesStore(
		(state) => state.setSelectedInspectorTag,
	);
	const backlinksQuery = useNoteBacklinks(file?.id);
	const versionsQuery = useNoteVersions(file?.id);
	const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>(
		{
			outline: true,
			tags: true,
			links: true,
			history: true,
			details: true,
		},
	);
	const isMdx = isMdxNote(file);
	const effectiveEditorMode = isMdx ? "raw" : editorMode;
	const canToggleEditorMode = !isMdx && Boolean(onToggleEditorMode);

	const details = useMemo(() => {
		if (!file) return [];
		const wordCount = file.content.split(/\s+/).filter(Boolean).length;
		const charCount = file.content.length;
		const fileSize = new Blob([file.content]).size;
		const readTime = Math.max(1, Math.ceil(wordCount / 200));

		return [
			{ label: "Created", value: formatTime(file.createdAt) },
			{ label: "Modified", value: formatTime(file.modifiedAt) },
			{ label: "File Size", value: formatSize(fileSize) },
			{ label: "Characters", value: charCount.toLocaleString() },
			{ label: "Words", value: wordCount.toLocaleString() },
			{ label: "Read Time", value: `${readTime}m` },
		];
	}, [file]);

	const headingItems = useMemo(() => {
		if (!file) return [];
		return file.content
			.split("\n")
			.filter((line) => /^#{1,3}\s/.test(line))
			.map((heading) => ({
				level: heading.match(/^(#+)/)?.[1].length || 1,
				text: heading.replace(/^#+\s+/, ""),
			}));
	}, [file]);

	const outgoingLinks = useMemo(
		() => buildOutgoingNoteLinks(file, files),
		[file, files],
	);
	const backlinks = backlinksQuery.data ?? [];
	const filesById = useMemo(
		() => new Map(files.map((item) => [item.id, item])),
		[files],
	);
	const tags = useMemo(() => (file ? uniqueTags(file) : []), [file]);
	const taggedNotes = useMemo(() => {
		if (!file || !selectedTag) return [];
		return files.filter(
			(item) => item.id !== file.id && uniqueTags(item).includes(selectedTag),
		);
	}, [file, files, selectedTag]);
	const historyItems = useMemo<VersionRowData[]>(() => {
		if (!file) return [];

		const checkpoints = (versionsQuery.data ?? []).map((version) => ({
			id: version.id,
			name: version.name,
			content: version.content,
			createdAt: version.createdAt,
			reason: summarizeNoteVersionReason(version.reason),
			reasonKind: version.reason,
			current: false,
		}));

		const items = [
			{
				id: `current-${file.id}`,
				name: file.name,
				content: file.content,
				createdAt: file.modifiedAt,
				reason: "",
				reasonKind: "current" as const,
				current: true,
			},
			...checkpoints,
		];

		return items.map((item, index) => ({
			...item,
			previousContent: index === 0 ? undefined : items[index - 1]?.content,
		}));
	}, [file, versionsQuery.data]);

	const historyBranchRoles = useMemo(
		() => getHistoryBranchRoles(historyItems),
		[historyItems],
	);
	const hasRestoreBranch = historyBranchRoles.includes("fork");
	const restoredSourceIndex = useMemo(() => {
		if (!hasRestoreBranch) return null;
		const forkIndex = historyBranchRoles.indexOf("fork");
		return findRestoredSourceIndex(historyItems, forkIndex);
	}, [hasRestoreBranch, historyBranchRoles, historyItems]);

	const toggleSection = (section: SectionKey) => {
		setOpenSections((current) => ({
			...current,
			[section]: !current[section],
		}));
	};

	useEffect(() => {
		if (!selectedTag) return;
		if (!tags.includes(selectedTag)) {
			setSelectedTag(null);
		}
	}, [selectedTag, tags]);

	const handleShare = () => {
		if (!file) return;
		onShare?.(file.id);
	};

	const asideClass = cn(
		"flex min-h-0 flex-col bg-background",
		isMobile
			? "h-full w-full rounded-[inherit] border-0 bg-transparent"
			: "h-full w-72 border-l border-border xl:w-80",
		className,
	);

	if (!file) {
		return <aside aria-label="Note inspector" className={asideClass} />;
	}

	return (
		<aside aria-label="Note inspector" className={asideClass}>
			{isMobile && (
				<div className="shrink-0 border-b border-border bg-background px-4 pb-3 pt-3">
					<div className="flex items-center justify-between gap-3">
						<div className="mx-auto h-1.5 w-12 bg-border" />
						{onRequestClose && (
							<button
								onClick={onRequestClose}
								onPointerDown={(event) => event.stopPropagation()}
								aria-label="Close details"
								data-sheet-no-drag
								className="pressable flex h-10 w-10 items-center justify-center border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
								title="Close details"
							>
								<X className="h-4 w-4" strokeWidth={1.6} />
							</button>
						)}
					</div>
				</div>
			)}

			<div className="min-h-0 flex-1 overflow-y-auto">
				<InspectorSection
					id="note-inspector-outline"
					title="Outline"
					icon={ListTree}
					count={headingItems.length}
					open={openSections.outline}
					onToggle={() => toggleSection("outline")}
				>
					{headingItems.length > 0 ? (
						<ul className="-mx-2 space-y-px">
							{headingItems.map((heading, index) => {
								const indent = (heading.level - 1) * 12;
								return (
									<li key={`${heading.text}-${index}`}>
										<button
											type="button"
											onClick={() => {
												const all = Array.from(
													document.querySelectorAll<HTMLElement>(
														'[data-content-type="heading"]',
													),
												);
												const levelStr =
													heading.level === 1 ? null : String(heading.level);
												const candidates = all.filter(
													(el) =>
														(el.getAttribute("data-level") ?? null) ===
														levelStr &&
														el.textContent?.trim() === heading.text,
												);
												const target =
													candidates[0] ??
													all.find(
														(el) => el.textContent?.trim() === heading.text,
													);
												target?.scrollIntoView({
													behavior: "smooth",
													block: "center",
												});
											}}
											className={cn(
												"group flex w-full cursor-pointer items-center gap-0 rounded text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
												heading.level === 1
													? "text-foreground/72"
													: heading.level === 2
														? "text-foreground/58"
														: "text-foreground/46",
											)}
											style={{ paddingLeft: `${indent + 8}px` }}
											title={heading.text}
										>
											{heading.level > 1 && (
												<span
													className={cn(
														"mr-2 shrink-0 self-stretch",
														"border-l",
														heading.level === 2
															? "border-muted-foreground/20"
															: "border-muted-foreground/12",
													)}
												/>
											)}
											<span
												className={cn(
													"truncate py-1 pr-2",
													heading.level === 1
														? "text-[12.5px] font-medium"
														: heading.level === 2
															? "text-[12px]"
															: "text-[11.5px]",
												)}
											>
												{heading.text}
											</span>
										</button>
									</li>
								);
							})}
						</ul>
					) : (
						<EmptyLine>No headings</EmptyLine>
					)}
				</InspectorSection>

				<InspectorSection
					id="note-inspector-tags"
					title="Tags"
					icon={Hash}
					count={tags.length}
					open={openSections.tags}
					onToggle={() => toggleSection("tags")}
				>
					{tags.length > 0 ? (
						<div className="space-y-3">
							<ul
								aria-label="Tags on this note"
								className="flex flex-wrap gap-1.5"
							>
								{tags.map((tag) => {
									const isSelected = tag === selectedTag;
									return (
										<li key={tag}>
											<button
												type="button"
												aria-pressed={isSelected}
												aria-label={`${isSelected ? "Hide" : "Show"} notes tagged ${tag}`}
												onClick={() => setSelectedTag(isSelected ? null : tag)}
												className={cn(
													"inline-flex min-h-7 cursor-pointer items-center border px-2 text-[12px] font-medium transition-colors focus-visible:border-ring focus-visible:outline-none",
													isSelected
														? "border-ring bg-secondary text-foreground"
														: "border-border bg-secondary/50 text-foreground/78 hover:border-ring/70 hover:text-foreground",
												)}
											>
												#{tag}
											</button>
										</li>
									);
								})}
							</ul>

							{selectedTag ? (
								<div className="-mx-2">
									<p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/62">
										Tagged #{selectedTag}
									</p>
									{taggedNotes.length > 0 ? (
										<ul
											aria-label={`Notes tagged ${selectedTag}`}
											className="space-y-0.5"
										>
											{taggedNotes.map((taggedFile) => (
												<li key={taggedFile.id}>
													<button
														type="button"
														onClick={() => onFileSelect?.(taggedFile.id)}
														disabled={!onFileSelect}
														className="group flex min-h-9 w-full cursor-pointer items-center gap-2 border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-muted focus-visible:border-ring focus-visible:bg-muted focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60 active:scale-[0.99]"
													>
														<FileText
															className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
															strokeWidth={1.5}
														/>
														<span className="min-w-0 flex-1 truncate text-[13px] text-foreground/82">
															{getNoteTitle(taggedFile)}
														</span>
														<ArrowUpRight
															className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
															strokeWidth={1.5}
														/>
													</button>
												</li>
											))}
										</ul>
									) : (
										<EmptyLine>
											No other notes are tagged #{selectedTag}.
										</EmptyLine>
									)}
								</div>
							) : null}
						</div>
					) : (
						<EmptyLine>
							No tags yet. Type # in the editor or use /tag.
						</EmptyLine>
					)}
				</InspectorSection>

				{(backlinks.length > 0 || outgoingLinks.length > 0) && (
					<InspectorSection
						id="note-inspector-links"
						title="Links"
						icon={Link2}
						count={backlinks.length + outgoingLinks.length}
						open={openSections.links}
						onToggle={() => toggleSection("links")}
					>
						<div className="space-y-4">
							{backlinks.length > 0 && (
								<div>
									<p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/50">
										Backlinks · {backlinks.length}
									</p>
									<ul
										aria-label="Notes linking to this note"
										className="-mx-2 space-y-0.5"
									>
										{backlinks.map((link, index) => (
											<LinkRow
												key={`${link.sourceNoteId}-${link.raw}-${link.targetNoteId ?? "unresolved"}-${index}`}
												link={link}
												filesById={filesById}
												onFileSelect={onFileSelect}
											/>
										))}
									</ul>
								</div>
							)}
							{outgoingLinks.length > 0 && (
								<div>
									<p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/50">
										Outgoing · {outgoingLinks.length}
									</p>
									<ul
										aria-label="Notes this note links to"
										className="-mx-2 space-y-0.5"
									>
										{outgoingLinks.map((link, index) => (
											<LinkRow
												key={`${link.sourceNoteId}-${link.raw}-${link.targetLabel}-${link.targetNoteId ?? "unresolved"}-${index}`}
												link={link}
												filesById={filesById}
												onFileSelect={onFileSelect}
											/>
										))}
									</ul>
								</div>
							)}
						</div>
					</InspectorSection>
				)}

				<InspectorSection
					id="note-inspector-history"
					title="History"
					icon={History}
					count={historyItems.length}
					open={openSections.history}
					onToggle={() => toggleSection("history")}
				>
					{historyItems.length > 0 ? (
						<ol className="relative -mx-1">
							{historyItems.map((version, index) => {
								const forkIndex = hasRestoreBranch
									? historyBranchRoles.indexOf("fork")
									: -1;
								const isRestoredTrunkLink =
									restoredSourceIndex !== null &&
									forkIndex !== -1 &&
									index > forkIndex &&
									index <= restoredSourceIndex;

								return (
									<VersionRow
										key={version.id}
										version={version}
										previousContent={version.previousContent}
										branchRole={historyBranchRoles[index] ?? "trunk"}
										isFirst={index === 0}
										isLast={index === historyItems.length - 1}
										hasFork={hasRestoreBranch}
										isRestoredSource={index === restoredSourceIndex}
										isRestoredTrunkLink={isRestoredTrunkLink}
										onView={
											!version.current && onViewVersion
												? () => {
														const fullVersion = (versionsQuery.data ?? []).find(
															(v) => v.id === version.id,
														);
														if (fullVersion) {
															onViewVersion(fullVersion);
														}
													}
												: undefined
										}
									/>
								);
							})}
						</ol>
					) : (
						<EmptyLine>
							No history yet. The first checkpoint appears after the next save.
						</EmptyLine>
					)}
				</InspectorSection>
			</div>

			<div className="shrink-0 border-t border-border bg-background">
				<InspectorSection
					id="note-inspector-details"
					title="Details"
					icon={Info}
					count={details.length + 2}
					open={openSections.details}
					onToggle={() => toggleSection("details")}
					className="border-b-0"
				>
					<dl className="space-y-2.5">
						{details.map((detail) => (
							<div
								key={detail.label}
								className="flex items-baseline justify-between gap-4"
							>
								<dt className="text-[13px] text-muted-foreground">
									{detail.label}
								</dt>
								<dd className="text-[13px] font-medium text-foreground/80 tabular-nums">
									{detail.value}
								</dd>
							</div>
						))}
						<div
							aria-hidden
							className="my-1 border-t border-border/70"
							role="separator"
						/>
						<InspectorNoteControls
							canToggleEditorMode={canToggleEditorMode}
							effectiveEditorMode={effectiveEditorMode}
							onToggleEditorMode={onToggleEditorMode}
							shareLabel="Share"
							onShare={handleShare}
						/>
					</dl>
				</InspectorSection>
			</div>
		</aside>
	);
}
