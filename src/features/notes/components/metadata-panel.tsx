"use client";

import { formatDistanceToNow } from "date-fns";
import {
	ArrowUpRight,
	ChevronRight,
	Eye,
	FileText,
	Hash,
	History,
	Info,
	Link2,
	ListTree,
	Plus,
	X,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { NoteVersionReason } from "@/domain/notes/models";
import {
	formatNoteVersionDelta,
	summarizeNoteVersionReason,
} from "@/domain/notes/versioning";
import { useCreateNote } from "@/features/notes/hooks/use-create-note";
import { useNoteBacklinks } from "@/features/notes/hooks/use-note-backlinks";
import { useNoteVersions } from "@/features/notes/hooks/use-note-versions";
import {
	buildOutgoingNoteLinks,
	extractNoteTags,
	getNoteTitle,
	type ResolvedNoteLink,
} from "@/features/notes/lib/note-links";
import { useNotesStore } from "@/features/notes/store";
import { cn } from "@/shared/lib/utils";
import type { NoteFile, NoteVersion } from "@/types/notes";

type Props = {
	file: NoteFile | null;
	files?: NoteFile[];
	className?: string;
	isMobile?: boolean;
	onRequestClose?: () => void;
	onFileSelect?: (id: string) => void;
	onViewVersion?: (version: NoteVersion) => void;
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
				className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
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

type VersionListItem = {
	id: string;
	name: string;
	content: string;
	createdAt: Date;
	reason: string;
	reasonKind: NoteVersionReason | "current";
	current?: boolean;
};

function getVersionEventLabel(version: VersionListItem) {
	if (version.current) return "Live";
	if (version.reasonKind === "autosave") return null;
	return version.reason;
}

function VersionRow({
	version,
	diffLabel,
	onView,
}: {
	version: VersionListItem;
	diffLabel: string;
	onView?: () => void;
}) {
	const eventLabel = getVersionEventLabel(version);

	return (
		<li className="relative pl-6 py-1.5 group">
			<span
				className={cn(
					"absolute left-[10px] top-2.5 h-2 w-2 rounded-full ring-2 ring-background",
					version.current
						? "bg-emerald-400"
						: "bg-muted-foreground/40 group-hover:bg-foreground/60",
				)}
				aria-hidden
			/>
			<div className="flex items-baseline justify-between gap-3">
				<span className="text-[11px] text-muted-foreground">
					{formatDistanceToNow(version.createdAt, { addSuffix: false })} ago
				</span>
				<span className="text-[10px] font-mono text-muted-foreground/70 tabular-nums">
					{diffLabel}
				</span>
			</div>
			<p
				className="truncate text-[12px] leading-snug text-foreground/86"
				title={version.name}
			>
				{version.current ? "Current version" : version.name}
			</p>
			<div className="mt-0.5 flex items-center justify-between gap-2">
				{eventLabel ? (
					<span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60">
						{eventLabel}
					</span>
				) : (
					<span aria-hidden />
				)}
				{!version.current && onView && (
					<button
						type="button"
						onClick={onView}
						className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground opacity-0 transition-colors group-hover:opacity-100 group-focus-within:opacity-100 hover:text-foreground"
					>
						<Eye className="h-2.5 w-2.5" strokeWidth={1.6} />
						View
					</button>
				)}
			</div>
		</li>
	);
}

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
	onRequestClose,
	onFileSelect,
	onViewVersion,
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
	const historyItems = useMemo<VersionListItem[]>(() => {
		if (!file) return [];

		const checkpoints: VersionListItem[] = (versionsQuery.data ?? []).map(
			(version) => ({
				id: version.id,
				name: version.name,
				content: version.content,
				createdAt: version.createdAt,
				reason: summarizeNoteVersionReason(version.reason),
				reasonKind: version.reason,
				current: false,
			}),
		);

		return [
			{
				id: `current-${file.id}`,
				name: file.name,
				content: file.content,
				createdAt: file.modifiedAt,
				reason: "Current version",
				reasonKind: "current",
				current: true,
			},
			...checkpoints,
		];
	}, [file, versionsQuery.data]);

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

	const asideClass = cn(
		"flex flex-col bg-background",
		isMobile
			? "h-full w-full rounded-[inherit] border-0 bg-transparent"
			: "w-72 border-l border-border xl:w-80",
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
														? "border-ring bg-muted text-foreground"
														: "border-border bg-muted text-foreground/78 hover:border-ring/70 hover:text-foreground",
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
										{backlinks.map((link) => (
											<LinkRow
												key={`${link.sourceNoteId}-${link.raw}`}
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
										{outgoingLinks.map((link) => (
											<LinkRow
												key={`${link.sourceNoteId}-${link.raw}-${link.targetLabel}`}
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
							<span
								aria-hidden
								className="absolute left-[14px] top-2 bottom-2 w-px bg-border"
							/>
							{historyItems.map((version, index) => {
								const newerVersion =
									index === 0 ? null : historyItems[index - 1];
								const diffLabel =
									index === 0
										? "live"
										: formatNoteVersionDelta(
												version.content,
												newerVersion?.content,
											);

								return (
									<VersionRow
										key={version.id}
										version={version}
										diffLabel={diffLabel}
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

			<div className="shrink-0">
				<InspectorSection
					id="note-inspector-details"
					title="Details"
					icon={Info}
					count={details.length}
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
					</dl>
				</InspectorSection>
			</div>
		</aside>
	);
}
