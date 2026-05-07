import { NoteFile } from "@/types/notes";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowUpRight,
  FileText,
  Hash,
  Info,
  Link2,
  ListTree,
  X,
} from "lucide-react";
import { useMemo } from "react";
import type { ComponentType, ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import {
  buildNoteLinkIndex,
  extractNoteTags,
  getNoteTitle,
  type ResolvedNoteLink,
} from "@/features/notes/lib/note-links";

interface MetadataPanelProps {
  file: NoteFile | null;
  files?: NoteFile[];
  className?: string;
  isMobile?: boolean;
  onRequestClose?: () => void;
  onFileSelect?: (id: string) => void;
}

function uniqueTags(file: NoteFile): string[] {
  return [...new Set([...(file.tags ?? []), ...extractNoteTags(file.content)])].toSorted((a, b) =>
    a.localeCompare(b),
  );
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
}: {
  id: string;
  title: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="border-b border-border px-4 py-4">
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
  const source = filesById.get(link.sourceNoteId);
  const target = link.targetNoteId ? filesById.get(link.targetNoteId) : null;
  const title =
    source && source.id !== link.targetNoteId
      ? getNoteTitle(source)
      : target
        ? getNoteTitle(target)
        : link.alias || link.targetLabel;
  const isResolved = link.status === "resolved" && link.targetNoteId;
  const navigateTargetId = source && source.id !== link.targetNoteId ? source.id : link.targetNoteId;
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
          className="group flex min-h-9 w-full items-center gap-2 border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-muted focus-visible:border-ring focus-visible:bg-muted focus-visible:outline-none active:scale-[0.99]"
        >
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
          <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/82">{title}</span>
          <ArrowUpRight
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            strokeWidth={1.5}
          />
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
}: MetadataPanelProps) {
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

  const linkIndex = useMemo(() => buildNoteLinkIndex(file, files), [file, files]);
  const filesById = useMemo(() => new Map(files.map((item) => [item.id, item])), [files]);

  if (!file) return null;

  const tags = uniqueTags(file);

  return (
    <aside
      aria-label="Note inspector"
      className={cn(
        "flex flex-col bg-background",
        isMobile ? "h-full w-full rounded-[inherit] border-0 bg-transparent" : "w-72 border-l border-border xl:w-80",
        className,
      )}
    >
      <div
        className={cn(
          "shrink-0 border-b border-border",
          isMobile ? "bg-background px-4 pb-3 pt-3" : "px-4 py-3",
        )}
      >
        {isMobile && <div className="mx-auto mb-3 h-1.5 w-12 bg-border" />}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground/70">
              Inspector
            </p>
            <p className="mt-1 truncate text-sm font-semibold tracking-[-0.02em] text-foreground">
              {getNoteTitle(file)}
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground/62">
              {details.find((detail) => detail.label === "Modified")?.value}
            </p>
          </div>
          {isMobile && onRequestClose && (
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        <InspectorSection id="note-inspector-tags" title="Tags" icon={Hash}>
          {tags.length > 0 ? (
            <ul aria-label="Tags on this note" className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <li
                  key={tag}
                  aria-label={`Tag ${tag}`}
                  className="inline-flex min-h-7 items-center border border-border bg-muted px-2 text-[12px] font-medium text-foreground/78"
                >
                  #{tag}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyLine>No tags yet. Type # in the editor or use /tag.</EmptyLine>
          )}
        </InspectorSection>

        <InspectorSection
          id="note-inspector-backlinks"
          title={`Backlinks (${linkIndex.backlinks.length})`}
          icon={Link2}
        >
          {linkIndex.backlinks.length > 0 ? (
            <ul aria-label="Notes linking to this note" className="-mx-2 space-y-0.5">
              {linkIndex.backlinks.map((link) => (
                <LinkRow
                  key={`${link.sourceNoteId}-${link.raw}`}
                  link={link}
                  filesById={filesById}
                  onFileSelect={onFileSelect}
                />
              ))}
            </ul>
          ) : (
            <EmptyLine>No backlinks yet. Mention this note from another note with @ or [[...]].</EmptyLine>
          )}
        </InspectorSection>

        <InspectorSection
          id="note-inspector-outgoing"
          title={`Outgoing (${linkIndex.outgoing.length})`}
          icon={ArrowUpRight}
        >
          {linkIndex.outgoing.length > 0 ? (
            <ul aria-label="Notes this note links to" className="-mx-2 space-y-0.5">
              {linkIndex.outgoing.map((link) => (
                <LinkRow
                  key={`${link.sourceNoteId}-${link.raw}-${link.targetLabel}`}
                  link={link}
                  filesById={filesById}
                  onFileSelect={onFileSelect}
                />
              ))}
            </ul>
          ) : (
            <EmptyLine>No outgoing links yet. Type @ or use /link note in the editor.</EmptyLine>
          )}
        </InspectorSection>

        <InspectorSection id="note-inspector-outline" title="Outline" icon={ListTree}>
          {headingItems.length > 0 ? (
            <ul className="space-y-1">
              {headingItems.map((heading, index) => (
                <li
                  key={`${heading.text}-${index}`}
                  className="truncate text-[13px] text-foreground/62"
                  style={{ paddingLeft: `${(heading.level - 1) * 12}px` }}
                >
                  {heading.text}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyLine>No headings</EmptyLine>
          )}
        </InspectorSection>

        <InspectorSection id="note-inspector-details" title="Details" icon={Info}>
          <dl className="space-y-2.5">
            {details.map((detail) => (
              <div key={detail.label} className="flex items-baseline justify-between gap-4">
                <dt className="text-[13px] text-muted-foreground">{detail.label}</dt>
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
