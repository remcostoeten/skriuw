"use client";

import { formatDistanceToNow } from "date-fns";
import {
	ArrowDownLeft,
	ArrowUpRight,
	Contact,
	Copy,
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
	Unlink,
	Users,
	X,
} from "lucide-react";
import Link from "next/link";
import { memo, type ComponentType, type ReactNode } from "react";
import {
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useState,
	useSyncExternalStore,
} from "react";
import type { NoteVersionReason } from "@/domain/notes/models";
import {
	getNoteVersionDeltaValues,
	getVersionContextPreview,
	summarizeNoteVersionReason,
} from "@/domain/notes/versioning";
import { usePreferencesStore } from "@/features/settings/store";
import { useNoteLinkActions } from "@/features/editor/hooks/use-note-link-actions";
import { useNoteBacklinks } from "@/features/notes/hooks/use-note-backlinks";
import { useDocumentOutline } from "@/features/notes/hooks/use-document-outline";
import { DocumentOutline } from "@/features/notes/components/document-outline";
import { useNoteVersions } from "@/features/notes/hooks/use-note-versions";
import {
	buildOutgoingNoteLinks,
	extractNoteTags,
	getNoteSearchableContent,
	getNoteTitle,
	type ResolvedNoteLink,
} from "@/domain/notes/note-links";
import { isMdxNote } from "@/features/editor/lib/editor-mode";
import { extractRichDocumentPersonIds } from "@/domain/notes/rich-document";
import type { Person } from "@/domain/people/models";
import { useWorkspacePeople } from "@/features/people/hooks/use-people";
import { useNotesStore } from "@/features/notes/store";
import { cn } from "@/shared/lib/utils";
import { NoteSendDropdown } from "@/features/notes/components/note-send-menu";
import { GuestGate } from "@/shared/ui/guest-gate";
import {
	isTauriRuntime,
	useIsGuestWorkspace,
	useWorkspaceCapabilities,
} from "@/core/workspace-backend";
import {
	HistoryGraphRail,
	type HistoryBranchRole,
} from "@/features/notes/components/note-history-graph";
import {
	findRestoredSourceIndex,
	getHistoryBranchRoles,
} from "@/features/notes/components/note-history-graph-utils";
import { StaleShareHint } from "@/features/notes/components/stale-share-hint";
import { copyTextToClipboard, resolveClientShareUrl } from "@/features/notes/lib/note-share-export";
import { useNoteSharing } from "@/features/sharing/hooks/use-note-sharing";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
import { showUserToast } from "@/shared/lib/user-toast";
import { AnimatedNumber } from "@/shared/ui/animated-number";
import type { NoteFile, NoteVersion } from "@/types/notes";
import { CollaboratorsSection } from "@/features/collaboration/components/collaborators-section";
import { UnlinkedMentionsSection } from "@/features/notes/components/unlinked-mentions-section";
import { findUnlinkedMentions } from "@/domain/notes/unlinked-mentions";
import { useAuth } from "@/core/auth/use-auth";
import { goto, useGotoTarget } from "@/core/quick-access";

const EMPTY_FILES: NoteFile[] = [];

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

type SectionKey =
	| "outline"
	| "tags"
	| "people"
	| "links"
	| "mentions"
	| "history"
	| "details"
	| "collaborators";

function normalizeTag(tag: string): string {
	return tag.trim().replace(/^#/, "").toLowerCase();
}

function uniqueTags(file: NoteFile): string[] {
	return [
		...new Set(
			[...(file.tags ?? []), ...extractNoteTags(getNoteSearchableContent(file))].flatMap(
				(tag) => {
					const normalized = normalizeTag(tag);
					return normalized ? [normalized] : [];
				},
			),
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
	contentClassName,
}: {
	id: string;
	title: string;
	icon: ComponentType<{ className?: string; strokeWidth?: number }>;
	count?: number;
	open: boolean;
	onToggle: () => void;
	children: ReactNode;
	className?: string;
	contentClassName?: string;
}) {
	return (
		<section aria-labelledby={id} className={cn("border-b border-border", className)}>
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
			{open && <div className={cn("px-4 pb-4", contentClassName)}>{children}</div>}
		</section>
	);
}

function EmptyLine({ children }: { children: ReactNode }) {
	return <p className="text-[13px] leading-5 text-muted-foreground/62">{children}</p>;
}

function InspectorNoteControls({
	file,
	canToggleEditorMode,
	effectiveEditorMode,
	onToggleEditorMode,
	onShare,
	isOwnNote,
	isMobile = false,
}: {
	file: NoteFile;
	canToggleEditorMode: boolean;
	effectiveEditorMode: "raw" | "block";
	onToggleEditorMode?: () => void;
	onShare: () => void;
	isOwnNote: boolean;
	isMobile?: boolean;
}) {
	const isDesktop = isTauriRuntime();
	const { shareQuery, refresh } = useNoteSharing(file.id);
	const share = shareQuery.data;
	const shareActionLabel = share ? "Manage link" : "Create link";
	const isRefreshingShare = refresh.isPending;

	const handleRefreshShareLink = async () => {
		if (!share) return;
		try {
			await refresh.mutateAsync(file.id);
			showUserToast("Link refreshed", "success");
			triggerNativeFeedback("success");
		} catch {
			showUserToast("Couldn't refresh link", "error");
			triggerNativeFeedback("dismiss");
		}
	};

	const handleCopyShareLink = async () => {
		if (!share) return;
		const url = resolveClientShareUrl(share.path, share.url);
		const copied = await copyTextToClipboard(url);
		if (copied) {
			showUserToast("Link copied", "success");
			triggerNativeFeedback("success");
			return;
		}
		showUserToast("Couldn't copy link", "error");
		triggerNativeFeedback("dismiss");
	};

	const staleShareHint = share?.isStale ? (
		<StaleShareHint
			isRefreshing={isRefreshingShare}
			onRefresh={() => void handleRefreshShareLink()}
		/>
	) : null;

	const formatControl = canToggleEditorMode ? (
		<div
			className="inline-flex items-center gap-1.5 text-[13px]"
			role="group"
			aria-label="Editor mode"
		>
			<button
				type="button"
				onClick={effectiveEditorMode === "raw" ? onToggleEditorMode : undefined}
				aria-pressed={effectiveEditorMode === "block"}
				className={cn(
					"rounded-md transition-colors",
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
				onClick={effectiveEditorMode === "block" ? onToggleEditorMode : undefined}
				aria-pressed={effectiveEditorMode === "raw"}
				className={cn(
					"rounded-md transition-colors",
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
	);

	if (isMobile) {
		return (
			<div className="space-y-3">
				{/* Publishing a share link is owner-only; collaborators don't see it. */}
				{isOwnNote && !isDesktop ? (
					<div className="overflow-hidden rounded-2xl border border-foreground/8 bg-foreground/[0.03]">
						{share ? (
							<>
								<button
									type="button"
									onClick={() => void handleCopyShareLink()}
									className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-[15px] text-foreground transition-colors active:bg-foreground/5"
								>
									<Copy className="h-5 w-5 shrink-0 text-foreground/72" />
									Copy link
								</button>
								<div className="mx-4 h-px bg-foreground/8" />
							</>
						) : null}
						<GuestGate feature="share" align="start">
							<button
								type="button"
								onClick={onShare}
								className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-[15px] text-foreground transition-colors active:bg-foreground/5"
							>
								<Link2 className="h-5 w-5 shrink-0 text-foreground/72" />
								{shareActionLabel}
							</button>
						</GuestGate>
						<div className="mx-4 h-px bg-foreground/8" />
						<GuestGate feature="share" align="start">
							<NoteSendDropdown note={file} isMobile mobileTriggerVariant="row" />
						</GuestGate>
					</div>
				) : null}
				{isOwnNote && !isDesktop ? staleShareHint : null}
			</div>
		);
	}

	return (
		<>
			<div className="flex items-baseline justify-between gap-4">
				<dt className="text-[13px] text-muted-foreground">Format</dt>
				<dd>{formatControl}</dd>
			</div>
			{/* Publishing a share link is owner-only; collaborators don't see it. */}
			{isOwnNote && !isDesktop ? (
				<>
					<div className="flex items-start justify-between gap-4">
						<dt className="text-[13px] text-muted-foreground">Share link</dt>
						<dd className="flex flex-col items-end gap-1">
							{staleShareHint}
							<div className="flex shrink-0 items-center gap-3">
								{share ? (
									<button
										type="button"
										onClick={() => void handleCopyShareLink()}
										className="whitespace-nowrap text-[13px] font-medium text-foreground/80 transition-colors hover:text-foreground"
									>
										Copy link
									</button>
								) : null}
								<GuestGate feature="share">
									<button
										type="button"
										onClick={onShare}
										className="whitespace-nowrap text-[13px] font-medium text-foreground/80 transition-colors hover:text-foreground"
									>
										{shareActionLabel}
									</button>
								</GuestGate>
							</div>
						</dd>
					</div>
					<div className="flex items-baseline justify-between gap-4">
						<dt className="text-[13px] text-muted-foreground">Send note</dt>
						<dd>
							<GuestGate feature="share">
								<NoteSendDropdown note={file} />
							</GuestGate>
						</dd>
					</div>
				</>
			) : null}
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

function VersionDeltaValue({
	value,
	colorized = false,
	animate = true,
}: {
	value: number;
	colorized?: boolean;
	animate?: boolean;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-baseline gap-0.5",
				colorized && value > 0 && "text-emerald-400",
				colorized && value < 0 && "text-destructive",
				(!colorized || value === 0) && "text-muted-foreground/70",
			)}
		>
			<span aria-hidden>{value < 0 ? "−" : "+"}</span>
			<AnimatedNumber value={Math.abs(value)} animate={animate} className="tabular-nums" />
		</span>
	);
}

function VersionDelta({
	currentContent,
	previousContent,
	colorized = false,
	animate = true,
}: {
	currentContent: string;
	previousContent?: string;
	colorized?: boolean;
	animate?: boolean;
}) {
	const values = getNoteVersionDeltaValues(currentContent, previousContent);
	if (!values) {
		return null;
	}

	return (
		<span className="inline-flex shrink-0 items-baseline gap-1 font-mono text-[10px] tabular-nums">
			<VersionDeltaValue value={values.wordDelta} colorized={colorized} animate={animate} />
			<VersionDeltaValue value={values.charDelta} colorized={colorized} animate={animate} />
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

type VersionRowProps = {
	version: VersionListItem;
	previousContent?: string;
	branchRole: HistoryBranchRole;
	isFirst: boolean;
	isLast: boolean;
	hasFork: boolean;
	isRestoredSource?: boolean;
	isRestoredTrunkLink?: boolean;
	animateNumbers?: boolean;
	onView?: (id: string) => void;
};

const VersionRow = memo(function VersionRow({
	version,
	previousContent,
	branchRole,
	isFirst,
	isLast,
	hasFork,
	isRestoredSource,
	isRestoredTrunkLink,
	animateNumbers = true,
	onView,
}: VersionRowProps) {
	const eventLabel = getVersionEventLabel(version);
	const isFork = branchRole === "fork";
	const mounted = useSyncExternalStore(
		() => () => {},
		() => true,
		() => false,
	);

	const delta =
		previousContent !== undefined ? (
			<VersionDelta
				currentContent={version.content}
				previousContent={previousContent}
				colorized={isFork}
				animate={animateNumbers}
			/>
		) : null;

	const contextPreview = useMemo(
		() => getVersionContextPreview(version.content),
		[version.content],
	);

	return (
		<li className="group relative py-2 pl-9 pr-11">
			<HistoryGraphRail
				branchRole={branchRole}
				isFirst={isFirst}
				isLast={isLast}
				isCurrent={version.current}
				hasFork={hasFork}
				isRestoredTrunkLink={isRestoredTrunkLink}
			/>
			<div className="flex min-w-0 flex-col gap-0.5">
				<div className="flex min-w-0 items-center gap-1.5">
					<span className="shrink-0 text-[11px] text-muted-foreground">
						{version.current
							? "Now"
							: mounted
								? `${formatDistanceToNow(version.createdAt, { addSuffix: false })} ago`
								: ""}
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
				{contextPreview ? (
					<p
						className="truncate pr-6 text-[11px] leading-4 text-muted-foreground/50"
						aria-label={contextPreview}
					>
						{contextPreview}
					</p>
				) : null}
			</div>
			{!version.current && onView ? (
				<button
					type="button"
					onClick={() => onView(version.id)}
					className="hover-reveal absolute right-0 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
				>
					<Eye className="h-2.5 w-2.5" strokeWidth={1.6} />
					View
				</button>
			) : null}
		</li>
	);
}, areVersionRowsEqual);

function versionTime(value: Date | string): number {
	return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function areVersionRowsEqual(prev: VersionRowProps, next: VersionRowProps): boolean {
	return (
		prev.version.id === next.version.id &&
		prev.version.content === next.version.content &&
		prev.version.current === next.version.current &&
		prev.version.reason === next.version.reason &&
		prev.version.reasonKind === next.version.reasonKind &&
		versionTime(prev.version.createdAt) === versionTime(next.version.createdAt) &&
		prev.previousContent === next.previousContent &&
		prev.branchRole === next.branchRole &&
		prev.isFirst === next.isFirst &&
		prev.isLast === next.isLast &&
		prev.hasFork === next.hasFork &&
		prev.isRestoredSource === next.isRestoredSource &&
		prev.isRestoredTrunkLink === next.isRestoredTrunkLink &&
		prev.animateNumbers === next.animateNumbers &&
		prev.onView === next.onView
	);
}

function LinkGroupHeader({
	icon: Icon,
	label,
	count,
}: {
	icon: ComponentType<{ className?: string; strokeWidth?: number }>;
	label: string;
	count: number;
}) {
	return (
		<div className="mb-1.5 flex items-center gap-1.5 px-2">
			<Icon className="h-3 w-3 shrink-0 text-muted-foreground/45" strokeWidth={2} />
			<span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
				{label}
			</span>
			<span className="ml-auto min-w-4 rounded-full bg-muted px-1.5 py-px text-center text-[10px] font-medium tabular-nums text-muted-foreground/70">
				{count}
			</span>
		</div>
	);
}

function LinkRow({
	link,
	direction,
	filesById,
	onFileSelect,
	isMobile = false,
}: {
	link: ResolvedNoteLink;
	direction: "incoming" | "outgoing";
	filesById: Map<string, NoteFile>;
	onFileSelect?: (id: string) => void;
	isMobile?: boolean;
}) {
	const files = useMemo(() => [...filesById.values()], [filesById]);
	const { createAndOpenNote } = useNoteLinkActions(files);
	const source = filesById.get(link.sourceNoteId);
	const target = link.targetNoteId ? filesById.get(link.targetNoteId) : null;
	const isBacklink = direction === "incoming";
	const displayNote = isBacklink ? source : target;
	const title = displayNote ? getNoteTitle(displayNote) : link.alias || link.targetLabel;
	const isResolved = link.status === "resolved" && link.targetNoteId;
	const navigateTargetId = isBacklink ? link.sourceNoteId : link.targetNoteId;
	const rowLabel = isBacklink ? `Open backlink source ${title}` : `Open linked note ${title}`;
	const rowHeight = isMobile ? "min-h-11" : "min-h-9";

	if (isResolved && navigateTargetId && onFileSelect) {
		return (
			<li>
				<button
					type="button"
					onClick={() => onFileSelect(navigateTargetId)}
					aria-label={rowLabel}
					className={cn(
						"group flex w-full cursor-pointer items-center gap-2 border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-muted focus-visible:border-ring focus-visible:bg-muted focus-visible:outline-none",
						rowHeight,
						isMobile && "active:bg-muted",
					)}
				>
					<FileText
						className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
						strokeWidth={1.5}
					/>
					<span className="min-w-0 flex-1 truncate text-[13px] text-foreground/82">
						{title}
					</span>
					<ArrowUpRight
						className="hover-reveal h-3.5 w-3.5 shrink-0 text-muted-foreground"
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
					onClick={() => createAndOpenNote(title)}
					aria-label={`Create note "${title}"`}
					className={cn(
						"group flex w-full cursor-pointer items-center gap-2 border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-muted focus-visible:border-ring focus-visible:bg-muted focus-visible:outline-none",
						rowHeight,
						isMobile && "active:bg-muted",
					)}
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
		<li className={cn("flex items-center gap-2 px-2 py-1.5", rowHeight)}>
			<FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground/62" strokeWidth={1.5} />
			<span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
				{link.alias || link.targetLabel}
			</span>
			<span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/52">
				{link.status}
			</span>
		</li>
	);
}

function useInspectorData({
	file,
	files,
	effectiveEditorMode,
}: {
	file: NoteFile | null;
	files: NoteFile[];
	effectiveEditorMode: "raw" | "block";
}) {
	const selectedTag = useNotesStore((state) => state.ui.selectedInspectorTag);
	const setSelectedTag = useNotesStore((state) => state.setSelectedInspectorTag);
	const backlinksQuery = useNoteBacklinks(file?.id);
	const versionsQuery = useNoteVersions(file?.id);
	// The detail cache hands this panel a new `file` object on every keystroke.
	// All content-derived sections (details, outline, links, mentions, tags,
	// history) compute from this deferred snapshot so their workspace-wide
	// scans run off the urgent typing lane and never cost input frames.
	const deferredFile = useDeferredValue(file);

	const details = useMemo(() => {
		if (!deferredFile) return [];
		const wordCount = deferredFile.content.split(/\s+/).filter(Boolean).length;
		const charCount = deferredFile.content.length;
		const fileSize = new Blob([deferredFile.content]).size;
		const readTime = Math.max(1, Math.ceil(wordCount / 200));

		return [
			{ label: "Created", value: formatTime(deferredFile.createdAt) },
			{ label: "Modified", value: formatTime(deferredFile.modifiedAt) },
			{ label: "File Size", value: formatSize(fileSize) },
			{ label: "Characters", value: charCount.toLocaleString() },
			{ label: "Words", value: wordCount.toLocaleString() },
			{ label: "Read Time", value: `${readTime}m` },
		];
	}, [deferredFile]);

	const {
		headings: outlineHeadings,
		activeKey: outlineActiveKey,
		scrollToHeading,
	} = useDocumentOutline({
		noteId: file?.id ?? null,
		mode: effectiveEditorMode,
		content: deferredFile?.content ?? "",
		richContent: deferredFile?.richContent,
	});

	const outgoingLinks = useMemo(
		() => buildOutgoingNoteLinks(deferredFile, files),
		[deferredFile, files],
	);
	const unlinkedMentions = useMemo(
		() => findUnlinkedMentions(deferredFile, files),
		[deferredFile, files],
	);
	const backlinks = backlinksQuery.data ?? [];
	const filesById = useMemo(() => new Map(files.map((item) => [item.id, item])), [files]);
	const tags = useMemo(() => (deferredFile ? uniqueTags(deferredFile) : []), [deferredFile]);
	const peopleQuery = useWorkspacePeople();
	const mentionedPeople = useMemo(() => {
		if (!deferredFile) return [];
		const ids = extractRichDocumentPersonIds(deferredFile.richContent);
		if (ids.length === 0) return [];
		const byId = new Map((peopleQuery.data ?? []).map((person) => [person.id, person]));
		return ids.map((id) => byId.get(id)).filter((person): person is Person => Boolean(person));
	}, [deferredFile, peopleQuery.data]);
	const taggedNotes = useMemo(() => {
		if (!file || !selectedTag) return [];
		return files.filter(
			(item) => item.id !== file.id && new Set(uniqueTags(item)).has(selectedTag),
		);
	}, [file, files, selectedTag]);
	const historyItems = useMemo<VersionRowData[]>(() => {
		if (!deferredFile) return [];

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
				id: `current-${deferredFile.id}`,
				name: deferredFile.name,
				content: deferredFile.content,
				createdAt: deferredFile.modifiedAt,
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
	}, [deferredFile, versionsQuery.data]);

	const historyBranchRoles = useMemo(() => getHistoryBranchRoles(historyItems), [historyItems]);
	const hasRestoreBranch = historyBranchRoles.includes("fork");
	const restoredSourceIndex = useMemo(() => {
		if (!hasRestoreBranch) return null;
		const forkIndex = historyBranchRoles.indexOf("fork");
		return findRestoredSourceIndex(historyItems, forkIndex);
	}, [hasRestoreBranch, historyBranchRoles, historyItems]);

	useEffect(() => {
		if (!selectedTag) return;
		if (!tags.includes(selectedTag)) {
			setSelectedTag(null);
		}
	}, [selectedTag, tags, setSelectedTag]);

	return {
		selectedTag,
		setSelectedTag,
		deferredFile,
		details,
		outlineHeadings,
		outlineActiveKey,
		scrollToHeading,
		outgoingLinks,
		unlinkedMentions,
		backlinks,
		filesById,
		tags,
		mentionedPeople,
		taggedNotes,
		historyItems,
		historyBranchRoles,
		hasRestoreBranch,
		restoredSourceIndex,
		versionsQuery,
	};
}

function MetadataMobileHeader({ onRequestClose }: { onRequestClose?: () => void }) {
	return (
		<div className="shrink-0 border-b border-border bg-background px-4 pb-2 pt-2.5">
			<div aria-hidden className="mx-auto mb-2 h-1.5 w-11 rounded-full bg-border" />
			<div className="relative flex min-h-11 items-center justify-end gap-3">
				<span className="absolute left-0 top-1/2 -translate-y-1/2 text-[15px] font-semibold text-foreground">
					Note details
				</span>
				{onRequestClose && (
					<button
						type="button"
						onClick={onRequestClose}
						onPointerDown={(event) => event.stopPropagation()}
						aria-label="Close details"
						data-sheet-no-drag
						className="flex h-11 w-11 items-center justify-center rounded-full border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground active:bg-muted"
					>
						<X className="h-5 w-5" strokeWidth={1.6} />
					</button>
				)}
			</div>
		</div>
	);
}

function TagsSectionContent({
	tags,
	selectedTag,
	setSelectedTag,
	taggedNotes,
	onFileSelect,
	isMobile = false,
}: {
	tags: string[];
	selectedTag: string | null;
	setSelectedTag: (tag: string | null) => void;
	taggedNotes: NoteFile[];
	onFileSelect?: (id: string) => void;
	isMobile?: boolean;
}) {
	if (tags.length === 0) {
		return <EmptyLine>No tags yet. Type # in the editor or use /tag.</EmptyLine>;
	}

	return (
		<div className="space-y-3">
			<ul aria-label="Tags on this note" className="flex flex-wrap gap-1.5">
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
									"inline-flex cursor-pointer items-center border font-medium transition-colors focus-visible:border-ring focus-visible:outline-none",
									isMobile
										? "min-h-11 px-3 text-[14px] active:bg-secondary"
										: "min-h-7 px-2 text-[12px]",
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
						<ul aria-label={`Notes tagged ${selectedTag}`} className="space-y-0.5">
							{taggedNotes.map((taggedFile) => (
								<li key={taggedFile.id}>
									<button
										type="button"
										onClick={() => onFileSelect?.(taggedFile.id)}
										disabled={!onFileSelect}
										className={cn(
											"group flex w-full cursor-pointer items-center gap-2 border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-muted focus-visible:border-ring focus-visible:bg-muted focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60",
											isMobile ? "min-h-11 active:bg-muted" : "min-h-9",
										)}
									>
										<FileText
											className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
											strokeWidth={1.5}
										/>
										<span className="min-w-0 flex-1 truncate text-[13px] text-foreground/82">
											{getNoteTitle(taggedFile)}
										</span>
										<ArrowUpRight
											className="hover-reveal h-3.5 w-3.5 shrink-0 text-muted-foreground"
											strokeWidth={1.5}
										/>
									</button>
								</li>
							))}
						</ul>
					) : (
						<EmptyLine>No other notes are tagged #{selectedTag}.</EmptyLine>
					)}
				</div>
			) : null}
		</div>
	);
}

function PeopleSectionContent({
	people,
	isMobile = false,
}: {
	people: Person[];
	isMobile?: boolean;
}) {
	if (people.length === 0) {
		return <EmptyLine>No people mentioned yet. Type $ in the editor.</EmptyLine>;
	}

	return (
		<ul aria-label="People mentioned in this note" className="flex flex-wrap gap-1.5">
			{people.map((person) => (
				<li key={person.id}>
					<Link
						href={`/app/people/${person.id}`}
						className={cn(
							"inline-flex cursor-pointer items-center border border-border bg-secondary/50 font-medium text-foreground/78 transition-colors hover:border-ring/70 hover:text-foreground focus-visible:border-ring focus-visible:outline-none",
							isMobile
								? "min-h-11 px-3 text-[14px] active:bg-secondary"
								: "min-h-7 px-2 text-[12px]",
						)}
					>
						{person.name}
					</Link>
				</li>
			))}
		</ul>
	);
}

function LinksSectionContent({
	backlinks,
	outgoingLinks,
	filesById,
	onFileSelect,
	isMobile = false,
}: {
	backlinks: ResolvedNoteLink[];
	outgoingLinks: ResolvedNoteLink[];
	filesById: Map<string, NoteFile>;
	onFileSelect?: (id: string) => void;
	isMobile?: boolean;
}) {
	return (
		<div className="space-y-5">
			{backlinks.length > 0 && (
				<div>
					<LinkGroupHeader
						icon={ArrowDownLeft}
						label="Backlinks"
						count={backlinks.length}
					/>
					<ul
						aria-label="Notes linking to this note"
						className="-mx-2 space-y-0.5 border-l border-border/40 pl-1.5"
					>
						{backlinks.map((link) => (
							<LinkRow
								key={`incoming-${link.sourceNoteId}-${link.targetNoteId ?? link.targetLabel}-${link.kind}`}
								direction="incoming"
								link={link}
								filesById={filesById}
								onFileSelect={onFileSelect}
								isMobile={isMobile}
							/>
						))}
					</ul>
				</div>
			)}
			{outgoingLinks.length > 0 && (
				<div>
					<LinkGroupHeader
						icon={ArrowUpRight}
						label="Outgoing"
						count={outgoingLinks.length}
					/>
					<ul
						aria-label="Notes this note links to"
						className="-mx-2 space-y-0.5 border-l border-border/40 pl-1.5"
					>
						{outgoingLinks.map((link) => (
							<LinkRow
								key={`outgoing-${link.sourceNoteId}-${link.targetNoteId ?? link.targetLabel}-${link.kind}`}
								direction="outgoing"
								link={link}
								filesById={filesById}
								onFileSelect={onFileSelect}
								isMobile={isMobile}
							/>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}

function HistorySectionContent({
	historyItems,
	historyBranchRoles,
	hasRestoreBranch,
	restoredSourceIndex,
	animateNumbers,
	isPending,
	onView,
}: {
	historyItems: VersionRowData[];
	historyBranchRoles: HistoryBranchRole[];
	hasRestoreBranch: boolean;
	restoredSourceIndex: number | null;
	animateNumbers: boolean;
	isPending: boolean;
	onView?: (id: string) => void;
}) {
	if (historyItems.length === 0) {
		if (isPending) return null;
		return (
			<EmptyLine>No history yet. The first checkpoint appears after the next save.</EmptyLine>
		);
	}

	return (
		<ol className="relative -mx-1">
			{historyItems.map((version, index) => {
				const forkIndex = hasRestoreBranch ? historyBranchRoles.indexOf("fork") : -1;
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
						animateNumbers={animateNumbers}
						onView={onView}
					/>
				);
			})}
		</ol>
	);
}

export const MetadataPanel = memo(function MetadataPanel({
	file,
	files = EMPTY_FILES,
	className,
	isMobile = false,
	editorMode = "block",
	onToggleEditorMode,
	onRequestClose,
	onFileSelect,
	onViewVersion,
	onShare,
}: Props) {
	const rightSidebarGotoRef = useGotoTarget({ keybind: "r", to: goto.focus.rightSidebar });
	const isGuest = useIsGuestWorkspace();
	const capabilities = useWorkspaceCapabilities();
	const auth = useAuth();
	const animateNumbers = usePreferencesStore((state) => state.editor.animateNumbers);
	const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
		outline: true,
		tags: true,
		people: true,
		links: true,
		mentions: true,
		history: true,
		details: true,
		collaborators: false,
	});
	const isMdx = isMdxNote(file);
	const effectiveEditorMode = isMdx ? "raw" : editorMode;
	const canToggleEditorMode = !isMdx && Boolean(onToggleEditorMode);
	const {
		selectedTag,
		setSelectedTag,
		details,
		outlineHeadings,
		outlineActiveKey,
		scrollToHeading,
		outgoingLinks,
		unlinkedMentions,
		backlinks,
		filesById,
		tags,
		mentionedPeople,
		taggedNotes,
		historyItems,
		historyBranchRoles,
		hasRestoreBranch,
		restoredSourceIndex,
		versionsQuery,
	} = useInspectorData({ file, files, effectiveEditorMode });
	const { shareQuery } = useNoteSharing(file?.id);
	const isDesktopRuntime = isTauriRuntime();
	// Sharing is owner-only. `access === undefined` is the owner's own note.
	const isOwnNote = !file?.access || file.access === "owner";
	const inspectorControlCount = isOwnNote
		? isMobile && !isDesktopRuntime && shareQuery.data
			? 4
			: 3
		: 1;

	const toggleSection = (section: SectionKey) => {
		setOpenSections((current) => ({
			...current,
			[section]: !current[section],
		}));
	};

	const handleShare = () => {
		if (!file) return;
		onShare?.(file.id);
	};

	const handleViewVersion = useCallback(
		(id: string) => {
			if (!onViewVersion) return;
			const fullVersion = (versionsQuery.data ?? []).find((version) => version.id === id);
			if (fullVersion) onViewVersion(fullVersion);
		},
		[onViewVersion, versionsQuery.data],
	);

	const asideClass = cn(
		"flex min-h-0 flex-col bg-background",
		isMobile
			? "h-full w-full rounded-[inherit] border-0 bg-transparent"
			: "h-full w-72 border-l border-border xl:w-80",
		className,
	);

	if (!file) {
		return <aside aria-label="Note inspector" data-metadata-panel className={asideClass} />;
	}

	return (
		<aside
			ref={rightSidebarGotoRef}
			aria-label="Note inspector"
			data-metadata-panel
			tabIndex={-1}
			className={asideClass}
		>
			{isMobile && <MetadataMobileHeader onRequestClose={onRequestClose} />}

			<div
				className={cn(
					"min-h-0 flex-1 overflow-y-auto overscroll-contain",
					isMobile && "momentum-scroll",
				)}
			>
				<InspectorSection
					id="note-inspector-outline"
					title="Outline"
					icon={ListTree}
					count={outlineHeadings.length}
					open={openSections.outline}
					onToggle={() => toggleSection("outline")}
					contentClassName="px-3 pb-3"
				>
					<DocumentOutline
						headings={outlineHeadings}
						activeKey={outlineActiveKey}
						onSelect={scrollToHeading}
					/>
				</InspectorSection>

				<InspectorSection
					id="note-inspector-tags"
					title="Tags"
					icon={Hash}
					count={tags.length}
					open={openSections.tags}
					onToggle={() => toggleSection("tags")}
				>
					<TagsSectionContent
						tags={tags}
						selectedTag={selectedTag}
						setSelectedTag={setSelectedTag}
						taggedNotes={taggedNotes}
						onFileSelect={onFileSelect}
						isMobile={isMobile}
					/>
				</InspectorSection>

				<InspectorSection
					id="note-inspector-people"
					title="People"
					icon={Contact}
					count={mentionedPeople.length}
					open={openSections.people}
					onToggle={() => toggleSection("people")}
				>
					<PeopleSectionContent people={mentionedPeople} isMobile={isMobile} />
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
						<LinksSectionContent
							backlinks={backlinks}
							outgoingLinks={outgoingLinks}
							filesById={filesById}
							onFileSelect={onFileSelect}
							isMobile={isMobile}
						/>
					</InspectorSection>
				)}

				{unlinkedMentions.length > 0 && (
					<InspectorSection
						id="note-inspector-mentions"
						title="Unlinked mentions"
						icon={Unlink}
						count={unlinkedMentions.length}
						open={openSections.mentions}
						onToggle={() => toggleSection("mentions")}
					>
						<UnlinkedMentionsSection
							mentions={unlinkedMentions}
							filesById={filesById}
							onFileSelect={onFileSelect}
						/>
					</InspectorSection>
				)}

				{/* Collaborators — only for authenticated note owners (not guests). */}
				{!isGuest && file && auth.user && (
					<InspectorSection
						id="note-inspector-collaborators"
						title="Collaborators"
						icon={Users}
						open={openSections.collaborators}
						onToggle={() => toggleSection("collaborators")}
					>
						<CollaboratorsSection
							noteId={file.id}
							ownerName={auth.user.name}
							isOwner={file.access ? file.access === "owner" : true}
						/>
					</InspectorSection>
				)}

				{/* Only backends that persist versions (cloud server, desktop
				    SQLite) can serve history; the guest backend stores none, so
				    the section would be permanently empty and its View action dead. */}
				{capabilities.history && (
					<InspectorSection
						id="note-inspector-history"
						title="History"
						icon={History}
						count={historyItems.length}
						open={openSections.history}
						onToggle={() => toggleSection("history")}
					>
						<HistorySectionContent
							historyItems={historyItems}
							historyBranchRoles={historyBranchRoles}
							hasRestoreBranch={hasRestoreBranch}
							restoredSourceIndex={restoredSourceIndex}
							animateNumbers={animateNumbers}
							isPending={versionsQuery.isPending}
							onView={onViewVersion ? handleViewVersion : undefined}
						/>
					</InspectorSection>
				)}
			</div>

			<div className="shrink-0 border-t border-border bg-background">
				<InspectorSection
					id="note-inspector-details"
					title="Details"
					icon={Info}
					count={details.length + inspectorControlCount}
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
						<hr aria-hidden className="my-1 border-border/70" />
						<InspectorNoteControls
							file={file}
							canToggleEditorMode={canToggleEditorMode}
							effectiveEditorMode={effectiveEditorMode}
							onToggleEditorMode={onToggleEditorMode}
							onShare={handleShare}
							isOwnNote={isOwnNote}
							isMobile={isMobile}
						/>
					</dl>
				</InspectorSection>
			</div>
		</aside>
	);
});
