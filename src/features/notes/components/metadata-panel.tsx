"use client";

import { NoteFile } from "@/types/notes";
import { formatDistanceToNow } from "date-fns";
import { ArrowUpRight, FileText, Hash, Info, Link2, ListTree, Plus, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import type { ComponentType, ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { useNotesStore } from "@/features/notes/store";
import { useCreateNote } from "@/features/notes/hooks/use-create-note";
import { useNoteBacklinks } from "@/features/notes/hooks/use-note-backlinks";
import {
	buildOutgoingNoteLinks,
	extractNoteTags,
	getNoteTitle,
	type ResolvedNoteLink,
} from "@/features/notes/lib/note-links";

type Props = {
	file: NoteFile | null;
	files?: NoteFile[];
	className?: string;
	isMobile?: boolean;
	onRequestClose?: () => void;
	onFileSelect?: (id: string) => void;
};

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
	children,
	className,
}: {
	id: string;
	title: string;
	icon: ComponentType<{ className?: string; strokeWidth?: number }>;
	children: ReactNode;
	className?: string;
}) {
	return (
		<section aria-labelledby={id} className={cn("border-b border-border px-4 py-4", className)}>
			<h2
				id={id}
				className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/72"
			>
				<Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
				{title}
			</h2>
			{children}
		</section>
	);
}

function EmptyLine({ children }: { children: ReactNode }) {
	return <p className="text-[13px] leading-5 text-muted-foreground/62">{children}</p>;
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
					onClick={() => createNote.mutate({ name: title, content: `# ${title}\n\n` })}
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

export function MetadataPanel({
	file,
	files = [],
	className,
	isMobile = false,
	onRequestClose,
	onFileSelect,
}: Props) {
	const selectedTag = useNotesStore((state) => state.ui.selectedInspectorTag);
	const setSelectedTag = useNotesStore((state) => state.setSelectedInspectorTag);
	const backlinksQuery = useNoteBacklinks(file?.id);

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

	const outgoingLinks = useMemo(() => buildOutgoingNoteLinks(file, files), [file, files]);
	const backlinks = backlinksQuery.data ?? [];
	const filesById = useMemo(() => new Map(files.map((item) => [item.id, item])), [files]);
	const tags = useMemo(() => (file ? uniqueTags(file) : []), [file]);
	const taggedNotes = useMemo(() => {
		if (!file || !selectedTag) return [];
		return files.filter(
			(item) => item.id !== file.id && uniqueTags(item).includes(selectedTag),
		);
	}, [file, files, selectedTag]);

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
		<aside
			aria-label="Note inspector"
			className={asideClass}
		>
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
				<InspectorSection id="note-inspector-outline" title="Outline" icon={ListTree}>
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
													heading.level === 1
														? null
														: String(heading.level);
												const candidates = all.filter(
													(el) =>
														(el.getAttribute("data-level") ??
															null) === levelStr &&
														el.textContent?.trim() === heading.text,
												);
												const target =
													candidates[0] ??
													all.find(
														(el) =>
															el.textContent?.trim() ===
															heading.text,
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

				<InspectorSection id="note-inspector-tags" title="Tags" icon={Hash}>
					{tags.length > 0 ? (
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
												onClick={() =>
													setSelectedTag(isSelected ? null : tag)
												}
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
														onClick={() =>
															onFileSelect?.(taggedFile.id)
														}
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
						<EmptyLine>No tags yet. Type # in the editor or use /tag.</EmptyLine>
					)}
				</InspectorSection>

				{(backlinks.length > 0 || outgoingLinks.length > 0) && (
					<InspectorSection
						id="note-inspector-links"
						title={`Links (${backlinks.length + outgoingLinks.length})`}
						icon={Link2}
					>
						<div className="space-y-4">
							{backlinks.length > 0 && (
								<div>
									<p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/50">
										Backlinks · {backlinks.length}
									</p>
									<ul aria-label="Notes linking to this note" className="-mx-2 space-y-0.5">
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
									<ul aria-label="Notes this note links to" className="-mx-2 space-y-0.5">
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
			</div>

			<div className="shrink-0">
				<InspectorSection
					id="note-inspector-details"
					title="Details"
					icon={Info}
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
